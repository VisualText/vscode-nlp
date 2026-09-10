// Cross-pass symbol index for NLP++ analyzers -- language-server edition.
//
// Same job as the VSCode-side index it replaces: build a name -> declarations map
// across every .nlp/.pat file so go-to-definition, Ctrl-T, references and rename
// can resolve a rule or @DECL function declared in ANOTHER pass file. Parsing
// still reuses the pure declaredSymbols() analyzer; only the file scan, the URI
// handling and the caching live here.
//
// Differences from the VSCode version: URIs are plain strings, ranges are plain
// objects (see lineIndex.ts), and the workspace scan is a filesystem walk rather
// than vscode.workspace.findFiles -- the server has no VSCode API.

import * as fs from "fs";
import * as path from "path";
import { URI } from "vscode-uri";
import { declaredSymbols, NlpSymbolKind } from "../language/symbols";
import { parseKbConcepts } from "../language/kbConcepts";
import { tokenize } from "../format/tokenizer";
import { TokenKind } from "../format/types";
import { LineIndex, Range } from "./lineIndex";

export type IndexKind = NlpSymbolKind | "concept";

export interface IndexedSymbol {
	name: string;
	kind: IndexKind;
	uri: string;
	range: Range;        // the identifier's range (precomputed at index time)
	signature?: string;  // for functions: the raw parameter list
}

// A usage (reference) occurrence of an identifier -- powers Find All References
// and occurrence highlighting.
export interface IndexedRef {
	name: string;
	uri: string;
	range: Range;
}

// Identifier-like words worth recording as references: rule/concept/function
// names (optionally leading underscore), never pure numbers.
const IDENT = /^_?[A-Za-z][\w]*$/;

const INDEXED_EXT = new Set([".nlp", ".pat", ".kbb"]);

// Directories never worth walking. node_modules is obvious; <text>_log/ holds
// engine output (a -DEV run writes one .kbb per pass into it) and output/ is
// where the engine drops trees and logs. Mirrors the excludes the VSCode glob
// used, plus the same pruning the startup analyzer scan needed: an analyzer run
// writes thousands of files, and re-walking them stalls the server.
function isSkippedDir(name: string): boolean {
	return name === "node_modules" || name === ".git" || name === "output" || name.endsWith("_log");
}

// Cap the walk the way the old findFiles(..., 5000) call did, so a stray huge
// tree cannot wedge startup.
const MAX_FILES = 5000;

function walk(dir: string, out: string[]): void {
	if (out.length >= MAX_FILES) return;
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return; // unreadable directory -- a partial index still helps
	}
	for (const entry of entries) {
		if (out.length >= MAX_FILES) return;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!isSkippedDir(entry.name)) walk(full, out);
		} else if (INDEXED_EXT.has(path.extname(entry.name).toLowerCase())) {
			out.push(full);
		}
	}
}

export class NlpWorkspaceIndex {
	private byName = new Map<string, IndexedSymbol[]>();
	private byFile = new Map<string, IndexedSymbol[]>();
	private refsByName = new Map<string, IndexedRef[]>();
	private refsByFile = new Map<string, IndexedRef[]>();
	private roots: string[] = [];
	private built = false;
	private building: Promise<void> | undefined;

	// Workspace folders come from the initialize request; set before first use.
	setRoots(folders: string[]): void {
		this.roots = folders;
		this.built = false;
		this.building = undefined;
	}

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

		const files: string[] = [];
		for (const root of this.roots) walk(root, files);

		for (let i = 0; i < files.length; i++) {
			try {
				this.indexText(URI.file(files[i]).toString(), fs.readFileSync(files[i], "utf8"));
			} catch {
				// Skip unreadable files; a partial index still helps.
			}
			// Yield to the event loop periodically so a large workspace does not
			// block incoming requests for the whole scan.
			if (i % 200 === 199) await new Promise((r) => setImmediate(r));
		}
		this.built = true;
		this.building = undefined;
	}

	private isKb(uri: string): boolean {
		return uri.toLowerCase().endsWith(".kbb");
	}

	// (Re)index one file read from disk. Used for file-watcher events: indexing a
	// single created/changed file instead of rebuilding the whole workspace. If
	// the index hasn't been built yet, this is a no-op -- the lazy ensureBuilt()
	// will pick the file up, so background file churn (e.g. an analyzer run
	// writing KB files) costs nothing.
	indexUri(uri: string): void {
		if (!this.built) return;
		try {
			this.indexText(uri, fs.readFileSync(URI.parse(uri).fsPath, "utf8"));
		} catch {
			// unreadable / deleted between events -- ignore
		}
	}

	// (Re)index a single file from in-memory text (used on open / change / save).
	indexText(uri: string, text: string): void {
		this.removeFile(uri);
		// One line table per file, shared by every offset conversion below.
		const lines = new LineIndex(text);
		if (this.isKb(uri)) this.indexKb(uri, text, lines);
		else this.indexNlp(uri, text, lines);
	}

	private addDecl(uri: string, name: string, kind: IndexKind, range: Range, bucket: IndexedSymbol[], signature?: string): void {
		const entry: IndexedSymbol = { name, kind, uri, range, signature };
		bucket.push(entry);
		const list = this.byName.get(name) ?? [];
		list.push(entry);
		this.byName.set(name, list);
	}

	private indexNlp(uri: string, text: string, lines: LineIndex): void {
		const syms: IndexedSymbol[] = [];
		try {
			for (const d of declaredSymbols(text)) {
				this.addDecl(uri, d.name, d.kind, lines.range(d.selStart, d.selEnd), syms, d.signature);
			}
		} catch { /* keep whatever parsed; still index usages below */ }
		this.byFile.set(uri, syms);
		this.indexUsages(uri, text, lines);
	}

	private indexKb(uri: string, text: string, lines: LineIndex): void {
		const syms: IndexedSymbol[] = [];
		try {
			for (const c of parseKbConcepts(text)) {
				this.addDecl(uri, c.name, "concept", lines.range(c.start, c.end), syms);
			}
		} catch { /* tolerate */ }
		this.byFile.set(uri, syms);
	}

	// Record every identifier-like Word token as a reference occurrence. Uses the
	// tokenizer so matches inside strings and comments are excluded.
	private indexUsages(uri: string, text: string, lines: LineIndex): void {
		const refs: IndexedRef[] = [];
		try {
			for (const t of tokenize(text)) {
				if (t.kind !== TokenKind.Word || !IDENT.test(t.text)) continue;
				const ref: IndexedRef = { name: t.text, uri, range: lines.range(t.start, t.end) };
				refs.push(ref);
				const list = this.refsByName.get(t.text) ?? [];
				list.push(ref);
				this.refsByName.set(t.text, list);
			}
		} catch { /* tolerate */ }
		this.refsByFile.set(uri, refs);
	}

	removeFile(uri: string): void {
		const decls = this.byFile.get(uri);
		if (decls) {
			for (const e of decls) {
				const list = this.byName.get(e.name);
				if (!list) continue;
				const kept = list.filter((x) => x.uri !== uri);
				if (kept.length) this.byName.set(e.name, kept);
				else this.byName.delete(e.name);
			}
			this.byFile.delete(uri);
		}
		const refs = this.refsByFile.get(uri);
		if (refs) {
			for (const e of refs) {
				const list = this.refsByName.get(e.name);
				if (!list) continue;
				const kept = list.filter((x) => x.uri !== uri);
				if (kept.length) this.refsByName.set(e.name, kept);
				else this.refsByName.delete(e.name);
			}
			this.refsByFile.delete(uri);
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
