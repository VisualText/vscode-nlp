// Cross-pass symbol index for NLP++ analyzers.
//
// Builds a name -> declarations map across every .nlp/.pat file in the workspace
// so go-to-definition and the workspace symbol search (Ctrl-T) can resolve a
// rule or @DECL function declared in ANOTHER pass file, not just the current one.
// Parsing reuses the pure declaredSymbols() analyzer; only the file scan and
// caching live here (this is a VSCode adapter, so it may import 'vscode').

import * as vscode from "vscode";
import { declaredSymbols, NlpSymbolKind } from "./symbols";
import { parseKbConcepts } from "./kbConcepts";
import { tokenize } from "../format/tokenizer";
import { TokenKind } from "../format/types";

export type IndexKind = NlpSymbolKind | "concept";

export interface IndexedSymbol {
	name: string;
	kind: IndexKind;
	uri: vscode.Uri;
	range: vscode.Range; // the identifier's range (precomputed at index time)
	signature?: string;  // for functions: the raw parameter list
}

// A usage (reference) occurrence of an identifier -- powers Find All References
// and occurrence highlighting.
export interface IndexedRef {
	name: string;
	uri: vscode.Uri;
	range: vscode.Range;
}

// Identifier-like words worth recording as references: rule/concept/function
// names (optionally leading underscore), never pure numbers.
const IDENT = /^_?[A-Za-z][\w]*$/;

// Convert a source offset to a VSCode Position by counting newlines up to it.
function offsetToPosition(text: string, offset: number): vscode.Position {
	let line = 0;
	let last = 0; // offset of the start of the current line
	for (let i = 0; i < offset && i < text.length; i++) {
		if (text[i] === "\n") {
			line++;
			last = i + 1;
		}
	}
	return new vscode.Position(line, offset - last);
}

export class NlpWorkspaceIndex {
	private byName = new Map<string, IndexedSymbol[]>();
	private byFile = new Map<string, IndexedSymbol[]>();
	private refsByName = new Map<string, IndexedRef[]>();
	private refsByFile = new Map<string, IndexedRef[]>();
	private built = false;
	private building: Promise<void> | undefined;

	// Build once, lazily. Concurrent callers share the same in-flight build.
	async ensureBuilt(): Promise<void> {
		if (this.built) return;
		if (!this.building) this.building = this.rebuild();
		await this.building;
	}

	async rebuild(): Promise<void> {
		this.byName.clear();
		this.byFile.clear();
		this.refsByName.clear();
		this.refsByFile.clear();
		// .nlp/.pat carry rules + functions (and usages); .kbb carries concepts.
		const files = await vscode.workspace.findFiles("**/*.{nlp,pat,kbb}", "**/node_modules/**", 5000);
		for (const uri of files) {
			try {
				const bytes = await vscode.workspace.fs.readFile(uri);
				this.indexText(uri, Buffer.from(bytes).toString("utf8"));
			} catch {
				// Skip unreadable files; a partial index still helps.
			}
		}
		this.built = true;
		this.building = undefined;
	}

	private isKb(uri: vscode.Uri): boolean {
		return uri.path.toLowerCase().endsWith(".kbb");
	}

	// (Re)index a single file from in-memory text (used on save / on change).
	indexText(uri: vscode.Uri, text: string): void {
		this.removeFile(uri);
		if (this.isKb(uri)) this.indexKb(uri, text);
		else this.indexNlp(uri, text);
	}

	private addDecl(uri: vscode.Uri, name: string, kind: IndexKind, range: vscode.Range, bucket: IndexedSymbol[], signature?: string): void {
		const entry: IndexedSymbol = { name, kind, uri, range, signature };
		bucket.push(entry);
		const list = this.byName.get(name) ?? [];
		list.push(entry);
		this.byName.set(name, list);
	}

	private indexNlp(uri: vscode.Uri, text: string): void {
		const syms: IndexedSymbol[] = [];
		try {
			for (const d of declaredSymbols(text)) {
				const range = new vscode.Range(
					offsetToPosition(text, d.selStart),
					offsetToPosition(text, d.selEnd),
				);
				this.addDecl(uri, d.name, d.kind, range, syms, d.signature);
			}
		} catch { /* keep whatever parsed; still index usages below */ }
		this.byFile.set(uri.toString(), syms);
		this.indexUsages(uri, text);
	}

	private indexKb(uri: vscode.Uri, text: string): void {
		const syms: IndexedSymbol[] = [];
		try {
			for (const c of parseKbConcepts(text)) {
				const range = new vscode.Range(
					offsetToPosition(text, c.start),
					offsetToPosition(text, c.end),
				);
				this.addDecl(uri, c.name, "concept", range, syms);
			}
		} catch { /* tolerate */ }
		this.byFile.set(uri.toString(), syms);
	}

	// Record every identifier-like Word token as a reference occurrence. Uses the
	// tokenizer so matches inside strings and comments are excluded.
	private indexUsages(uri: vscode.Uri, text: string): void {
		const refs: IndexedRef[] = [];
		try {
			for (const t of tokenize(text)) {
				if (t.kind !== TokenKind.Word || !IDENT.test(t.text)) continue;
				const range = new vscode.Range(
					offsetToPosition(text, t.start),
					offsetToPosition(text, t.end),
				);
				const ref: IndexedRef = { name: t.text, uri, range };
				refs.push(ref);
				const list = this.refsByName.get(t.text) ?? [];
				list.push(ref);
				this.refsByName.set(t.text, list);
			}
		} catch { /* tolerate */ }
		this.refsByFile.set(uri.toString(), refs);
	}

	removeFile(uri: vscode.Uri): void {
		const key = uri.toString();
		const decls = this.byFile.get(key);
		if (decls) {
			for (const e of decls) {
				const list = this.byName.get(e.name);
				if (!list) continue;
				const kept = list.filter((x) => x.uri.toString() !== key);
				if (kept.length) this.byName.set(e.name, kept);
				else this.byName.delete(e.name);
			}
			this.byFile.delete(key);
		}
		const refs = this.refsByFile.get(key);
		if (refs) {
			for (const e of refs) {
				const list = this.refsByName.get(e.name);
				if (!list) continue;
				const kept = list.filter((x) => x.uri.toString() !== key);
				if (kept.length) this.refsByName.set(e.name, kept);
				else this.refsByName.delete(e.name);
			}
			this.refsByFile.delete(key);
		}
	}

	lookup(name: string): IndexedSymbol[] {
		return this.byName.get(name) ?? [];
	}

	// All reference occurrences of `name` across indexed .nlp/.pat files.
	references(name: string): IndexedRef[] {
		return this.refsByName.get(name) ?? [];
	}

	// All symbols whose name contains `query` (case-insensitive) for Ctrl-T.
	search(query: string): IndexedSymbol[] {
		const q = query.toLowerCase();
		const out: IndexedSymbol[] = [];
		for (const list of this.byName.values()) {
			for (const s of list) {
				if (!q.length || s.name.toLowerCase().includes(q)) out.push(s);
			}
		}
		return out;
	}
}

export const nlpWorkspaceIndex = new NlpWorkspaceIndex();
