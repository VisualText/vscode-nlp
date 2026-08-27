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

// Offset -> Position for one file, over a line table built once.
//
// This used to be a free function that counted newlines from byte 0 on every
// call, and indexing a file costs two calls per symbol -- quadratic in the file
// size. On a real analyzer that is not a slow path, it is a hang: the English
// lexicon en-full.kbb is 10 MB and parses to 375,449 concepts, so indexing that
// one file blocked the extension host for roughly two and a half hours, which
// VSCode reports as "Extension host unresponsive". Building the line table is a
// single pass; each lookup is then a binary search.
class LineIndex {
	// starts[i] = offset of the first character of line i.
	private readonly starts: number[] = [0];

	constructor(text: string) {
		for (let i = 0; i < text.length; i++) {
			if (text[i] === "\n") this.starts.push(i + 1);
		}
	}

	position(offset: number): vscode.Position {
		// Last line whose start is <= offset. An offset past the end of the text
		// lands on the final line, matching the old scan-and-clamp behaviour.
		let lo = 0;
		let hi = this.starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (this.starts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return new vscode.Position(lo, offset - this.starts[lo]);
	}
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
		// Skip node_modules and per-input analyzer log dirs (<text>_log/), which
		// hold engine output rather than source worth indexing.
		const files = await vscode.workspace.findFiles(
			"**/*.{nlp,pat,kbb}", "{**/node_modules/**,**/*_log/**}", 5000,
		);
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

	// (Re)index one file read from disk. Used for file-watcher events: indexing a
	// single created/changed file instead of rebuilding the whole workspace. If
	// the index hasn't been built yet, this is a no-op — the lazy ensureBuilt()
	// will pick the file up, so background file churn (e.g. an analyzer run
	// writing KB files) costs nothing.
	async indexUri(uri: vscode.Uri): Promise<void> {
		if (!this.built) return;
		try {
			const bytes = await vscode.workspace.fs.readFile(uri);
			this.indexText(uri, Buffer.from(bytes).toString("utf8"));
		} catch {
			// unreadable / deleted between events — ignore
		}
	}

	// (Re)index a single file from in-memory text (used on save / on change).
	indexText(uri: vscode.Uri, text: string): void {
		this.removeFile(uri);
		// One line table per file, shared by every offset conversion below.
		const lines = new LineIndex(text);
		if (this.isKb(uri)) this.indexKb(uri, text, lines);
		else this.indexNlp(uri, text, lines);
	}

	private addDecl(uri: vscode.Uri, name: string, kind: IndexKind, range: vscode.Range, bucket: IndexedSymbol[], signature?: string): void {
		const entry: IndexedSymbol = { name, kind, uri, range, signature };
		bucket.push(entry);
		const list = this.byName.get(name) ?? [];
		list.push(entry);
		this.byName.set(name, list);
	}

	private indexNlp(uri: vscode.Uri, text: string, lines: LineIndex): void {
		const syms: IndexedSymbol[] = [];
		try {
			for (const d of declaredSymbols(text)) {
				const range = new vscode.Range(lines.position(d.selStart), lines.position(d.selEnd));
				this.addDecl(uri, d.name, d.kind, range, syms, d.signature);
			}
		} catch { /* keep whatever parsed; still index usages below */ }
		this.byFile.set(uri.toString(), syms);
		this.indexUsages(uri, text, lines);
	}

	private indexKb(uri: vscode.Uri, text: string, lines: LineIndex): void {
		const syms: IndexedSymbol[] = [];
		try {
			for (const c of parseKbConcepts(text)) {
				const range = new vscode.Range(lines.position(c.start), lines.position(c.end));
				this.addDecl(uri, c.name, "concept", range, syms);
			}
		} catch { /* tolerate */ }
		this.byFile.set(uri.toString(), syms);
	}

	// Record every identifier-like Word token as a reference occurrence. Uses the
	// tokenizer so matches inside strings and comments are excluded.
	private indexUsages(uri: vscode.Uri, text: string, lines: LineIndex): void {
		const refs: IndexedRef[] = [];
		try {
			for (const t of tokenize(text)) {
				if (t.kind !== TokenKind.Word || !IDENT.test(t.text)) continue;
				const range = new vscode.Range(lines.position(t.start), lines.position(t.end));
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
