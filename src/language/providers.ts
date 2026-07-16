// VSCode adapters for NLP++ language intelligence.
//
// This is the ONLY file in src/language that imports 'vscode'. All analysis lives
// in the pure modules (symbols.ts, diagnostics.ts, nlpxxData.ts) so it can be
// unit-tested without an Electron host, mirroring the src/format architecture.
//
// Registers: DocumentSymbol (outline/breadcrumbs), Hover (built-in docs),
// Definition (same-file rule/function jumps), and a live diagnostics collection.

import * as vscode from "vscode";
import { analyzeSymbols, declaredSymbols, NlpSymbol } from "./symbols";
import { computeProblems } from "./diagnostics";
import { nlpWorkspaceIndex, IndexedSymbol } from "./workspaceIndex";
import { regionKindAt, RegionKind } from "./completion";
import { findEnclosingCall } from "./signature";
import { foldingRanges } from "./folding";
import { classifyTokens, SymbolSets, SemType } from "./semanticTokens";
import { findUnknownCalls } from "./quickfix";
import {
	BUILTIN_SET, BUILTIN_FUNCTIONS, KEYWORDS, KEYWORD_SET, RULE_KEYWORDS,
	REGION_MARKERS, LETTER_FUNCTIONS,
} from "./nlpxxData";

// Symbol sets from the workspace index + static tables, shared by the semantic
// highlighter and the unknown-call quick fix.
function gatherSymbolSets(): SymbolSets {
	const userFuncs = new Set<string>();
	const concepts = new Set<string>();
	const rules = new Set<string>();
	for (const s of nlpWorkspaceIndex.search("")) {
		if (s.kind === "function") userFuncs.add(s.name);
		else if (s.kind === "concept") concepts.add(s.name);
		else if (s.kind === "rule") rules.add(s.name);
	}
	return {
		letters: new Set(Object.keys(LETTER_FUNCTIONS)),
		userFuncs, concepts, rules,
		builtins: BUILTIN_SET,
	};
}

const NLP = { language: "nlp" } as const;

// ---- Outline / breadcrumbs -------------------------------------------------

function kindOf(sym: NlpSymbol): vscode.SymbolKind {
	switch (sym.kind) {
		case "region": return vscode.SymbolKind.Namespace;
		case "rule": return vscode.SymbolKind.Function;
		case "function": return vscode.SymbolKind.Method;
	}
}

function toDocSymbol(doc: vscode.TextDocument, sym: NlpSymbol): vscode.DocumentSymbol {
	const range = new vscode.Range(doc.positionAt(sym.start), doc.positionAt(sym.end));
	const selRaw = new vscode.Range(doc.positionAt(sym.selStart), doc.positionAt(sym.selEnd));
	// selectionRange must be contained in range; clamp defensively.
	const sel = range.contains(selRaw) ? selRaw : new vscode.Range(range.start, range.start);
	const ds = new vscode.DocumentSymbol(sym.name, sym.detail, kindOf(sym), range, sel);
	ds.children = sym.children.map((c) => toDocSymbol(doc, c));
	return ds;
}

const symbolProvider: vscode.DocumentSymbolProvider = {
	provideDocumentSymbols(doc) {
		try {
			return analyzeSymbols(doc.getText()).map((s) => toDocSymbol(doc, s));
		} catch {
			return [];
		}
	},
};

// ---- Hover -----------------------------------------------------------------

function markerAtPosition(doc: vscode.TextDocument, pos: vscode.Position): string | undefined {
	// If the cursor is on an @DIRECTIVE, return the bare keyword (e.g. "RULES").
	const line = doc.lineAt(pos.line).text;
	const m = /@@?([A-Za-z]+)/g;
	let hit: RegExpExecArray | null;
	while ((hit = m.exec(line)) !== null) {
		if (pos.character >= hit.index && pos.character <= hit.index + hit[0].length) {
			return hit[1].toUpperCase();
		}
	}
	return undefined;
}

const hoverProvider: vscode.HoverProvider = {
	provideHover(doc, pos) {
		const marker = markerAtPosition(doc, pos);
		if (marker && REGION_MARKERS[marker]) {
			return new vscode.Hover(
				new vscode.MarkdownString(`**@${marker}** — region\n\n${REGION_MARKERS[marker]}`),
			);
		}

		const range = doc.getWordRangeAtPosition(pos);
		if (!range) return undefined;
		const word = doc.getText(range);
		const lower = word.toLowerCase();

		if (LETTER_FUNCTIONS[word]) {
			return new vscode.Hover(
				new vscode.MarkdownString(`**${word}** — node accessor\n\n${LETTER_FUNCTIONS[word]}`),
				range,
			);
		}
		if (BUILTIN_SET.has(lower)) {
			// Deep-link to the function's own help page (Help/markdown/<name>.md),
			// falling back to the aggregate Functions page for the few without one.
			const arg = encodeURIComponent(JSON.stringify([word]));
			const md = new vscode.MarkdownString(
				`**${word}** — NLP++ built-in function\n\n` +
				`[Open help for \`${word}\`](command:helpView.openFunctionPage?${arg})`,
			);
			md.isTrusted = true;
			return new vscode.Hover(md, range);
		}
		if (KEYWORD_SET.has(lower)) {
			return new vscode.Hover(
				new vscode.MarkdownString(`**${word}** — NLP++ keyword`),
				range,
			);
		}
		return undefined;
	},
};

// ---- Go to definition (same file) -----------------------------------------

const definitionProvider: vscode.DefinitionProvider = {
	async provideDefinition(doc, pos) {
		const range = doc.getWordRangeAtPosition(pos);
		if (!range) return undefined;
		const word = doc.getText(range);
		const locations: vscode.Location[] = [];

		// Same-file declarations (parsed live so unsaved edits resolve correctly).
		try {
			for (const d of declaredSymbols(doc.getText())) {
				if (d.name === word) {
					locations.push(new vscode.Location(
						doc.uri,
						new vscode.Range(doc.positionAt(d.selStart), doc.positionAt(d.selEnd)),
					));
				}
			}
		} catch { /* fall through to the cross-file index */ }

		// Cross-pass declarations from the workspace index (other .nlp/.pat files).
		await nlpWorkspaceIndex.ensureBuilt();
		const here = doc.uri.toString();
		for (const s of nlpWorkspaceIndex.lookup(word)) {
			if (s.uri.toString() === here) continue; // same-file handled above
			locations.push(new vscode.Location(s.uri, s.range));
		}
		return locations;
	},
};

// ---- Workspace symbols (Ctrl-T) -------------------------------------------

function wsKind(sym: IndexedSymbol): vscode.SymbolKind {
	if (sym.kind === "concept") return vscode.SymbolKind.Class;
	if (sym.kind === "function") return vscode.SymbolKind.Method;
	return vscode.SymbolKind.Function;
}

const workspaceSymbolProvider: vscode.WorkspaceSymbolProvider = {
	async provideWorkspaceSymbols(query) {
		await nlpWorkspaceIndex.ensureBuilt();
		return nlpWorkspaceIndex.search(query).map(
			(s) => new vscode.SymbolInformation(
				s.name, wsKind(s), "", new vscode.Location(s.uri, s.range),
			),
		);
	},
};

// ---- Find all references ---------------------------------------------------

const referenceProvider: vscode.ReferenceProvider = {
	async provideReferences(doc, pos, context) {
		const range = doc.getWordRangeAtPosition(pos);
		if (!range) return [];
		const word = doc.getText(range);
		await nlpWorkspaceIndex.ensureBuilt();

		const locations = nlpWorkspaceIndex.references(word).map(
			(r) => new vscode.Location(r.uri, r.range),
		);
		if (context.includeDeclaration) {
			for (const d of nlpWorkspaceIndex.lookup(word)) {
				locations.push(new vscode.Location(d.uri, d.range));
			}
		}
		return locations;
	},
};

// ---- Rename symbol ---------------------------------------------------------

// Rename is name-based (it rewrites every identifier occurrence with the same
// text) so it is gated: only a symbol that is actually DECLARED somewhere -- a
// rule, an @DECL function, or a .kbb concept -- may be renamed. Built-ins,
// keywords, and undeclared words are rejected, which keeps the edit from
// sweeping up unrelated identifiers that merely share a name.
const renameProvider: vscode.RenameProvider = {
	async prepareRename(doc, pos) {
		const range = doc.getWordRangeAtPosition(pos);
		if (!range) throw new Error("You cannot rename this element.");
		const word = doc.getText(range);
		const lower = word.toLowerCase();
		if (BUILTIN_SET.has(lower) || KEYWORD_SET.has(lower)) {
			throw new Error("Cannot rename an NLP++ built-in or keyword.");
		}
		await nlpWorkspaceIndex.ensureBuilt();
		nlpWorkspaceIndex.indexText(doc.uri, doc.getText()); // cover unsaved edits
		if (nlpWorkspaceIndex.lookup(word).length === 0) {
			throw new Error(`"${word}" is not a declared rule, function, or concept.`);
		}
		return range;
	},

	async provideRenameEdits(doc, pos, newName) {
		const range = doc.getWordRangeAtPosition(pos);
		if (!range) return undefined;
		const word = doc.getText(range);
		await nlpWorkspaceIndex.ensureBuilt();
		nlpWorkspaceIndex.indexText(doc.uri, doc.getText());

		const edit = new vscode.WorkspaceEdit();
		const seen = new Set<string>();
		const add = (uri: vscode.Uri, r: vscode.Range) => {
			const key = `${uri.toString()}:${r.start.line}:${r.start.character}`;
			if (seen.has(key)) return;
			seen.add(key);
			edit.replace(uri, r, newName);
		};
		for (const ref of nlpWorkspaceIndex.references(word)) add(ref.uri, ref.range);
		for (const d of nlpWorkspaceIndex.lookup(word)) add(d.uri, d.range);
		return edit;
	},
};

// ---- Occurrence highlighting (current file) --------------------------------

const highlightProvider: vscode.DocumentHighlightProvider = {
	provideDocumentHighlights(doc, pos) {
		const range = doc.getWordRangeAtPosition(pos);
		if (!range) return [];
		const word = doc.getText(range);
		const here = doc.uri.toString();
		const out: vscode.DocumentHighlight[] = [];
		for (const r of nlpWorkspaceIndex.references(word)) {
			if (r.uri.toString() === here) out.push(new vscode.DocumentHighlight(r.range));
		}
		return out;
	},
};

// ---- Completion (IntelliSense) ---------------------------------------------

// Static suggestion sets, built once. Region markers, built-in functions,
// keywords, rule-element keywords, and node accessors never change at runtime.
function staticItem(label: string, kind: vscode.CompletionItemKind, detail: string, doc?: string): vscode.CompletionItem {
	const item = new vscode.CompletionItem(label, kind);
	item.detail = detail;
	if (doc) item.documentation = new vscode.MarkdownString(doc);
	return item;
}

const BUILTIN_ITEMS = BUILTIN_FUNCTIONS.map((f) =>
	staticItem(f, vscode.CompletionItemKind.Function, "NLP++ built-in function"));
const KEYWORD_ITEMS = KEYWORDS.map((k) =>
	staticItem(k, vscode.CompletionItemKind.Keyword, "NLP++ keyword"));
const RULE_KEYWORD_ITEMS = RULE_KEYWORDS.map((k) =>
	staticItem(k, vscode.CompletionItemKind.Keyword, "rule-element modifier"));
const LETTER_ITEMS = Object.entries(LETTER_FUNCTIONS).map(([name, doc]) =>
	staticItem(name, vscode.CompletionItemKind.Function, "node accessor", doc));
const REGION_ITEMS = Object.entries(REGION_MARKERS).map(([name, doc]) =>
	staticItem(name, vscode.CompletionItemKind.Keyword, "@region marker", doc));

// Index-derived items (rules / functions / concepts) rebuilt per request so new
// declarations show up. Deduped by name so a symbol declared in many passes
// appears once.
function indexItems(kinds: Set<string>): vscode.CompletionItem[] {
	const seen = new Set<string>();
	const out: vscode.CompletionItem[] = [];
	for (const s of nlpWorkspaceIndex.search("")) {
		if (!kinds.has(s.kind) || seen.has(s.name)) continue;
		seen.add(s.name);
		const kind = s.kind === "concept" ? vscode.CompletionItemKind.Class
			: s.kind === "function" ? vscode.CompletionItemKind.Method
			: vscode.CompletionItemKind.Function;
		out.push(staticItem(s.name, kind, `NLP++ ${s.kind}`));
	}
	return out;
}

const completionProvider: vscode.CompletionItemProvider = {
	async provideCompletionItems(doc, pos) {
		const linePrefix = doc.lineAt(pos.line).text.slice(0, pos.character);

		// Typing an "@directive": offer region markers (e.g. @RULES, @CODE).
		if (/@@?\w*$/.test(linePrefix)) {
			return REGION_ITEMS;
		}

		await nlpWorkspaceIndex.ensureBuilt();
		const region = regionKindAt(doc.getText(), doc.offsetAt(pos));

		if (region === RegionKind.Rules) {
			// Rule element context: modifiers + concepts + rule names.
			return [
				...RULE_KEYWORD_ITEMS,
				...indexItems(new Set(["concept", "rule"])),
			];
		}

		// Code (and Other/Preamble fallback): functions + keywords + accessors +
		// user-declared functions.
		return [
			...BUILTIN_ITEMS,
			...KEYWORD_ITEMS,
			...LETTER_ITEMS,
			...indexItems(new Set(["function"])),
		];
	},
};

// ---- Folding ---------------------------------------------------------------

const foldingProvider: vscode.FoldingRangeProvider = {
	provideFoldingRanges(doc) {
		try {
			return foldingRanges(doc.getText()).map(
				(r) => new vscode.FoldingRange(r.start, r.end, vscode.FoldingRangeKind.Region),
			);
		} catch {
			return [];
		}
	},
};

// ---- Signature help --------------------------------------------------------

// Split a raw parameter list into individual parameters, respecting nested
// parens/brackets (an NLP++ param like N("x") contains its own parens).
function splitParams(sig: string): string[] {
	if (!sig.trim()) return [];
	const parts: string[] = [];
	let depth = 0;
	let cur = "";
	for (const ch of sig) {
		if (ch === "(" || ch === "[" || ch === "{") depth++;
		else if (ch === ")" || ch === "]" || ch === "}") depth--;
		if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; }
		else cur += ch;
	}
	if (cur.trim()) parts.push(cur.trim());
	return parts;
}

const signatureProvider: vscode.SignatureHelpProvider = {
	async provideSignatureHelp(doc, pos) {
		const call = findEnclosingCall(doc.getText(), doc.offsetAt(pos));
		if (!call) return undefined;
		await nlpWorkspaceIndex.ensureBuilt();

		// Prefer a user-declared function with a known parameter list.
		const decl = nlpWorkspaceIndex.lookup(call.name).find((s) => s.kind === "function" && s.signature !== undefined);
		let sigInfo: vscode.SignatureInformation;
		if (decl) {
			const params = splitParams(decl.signature ?? "");
			sigInfo = new vscode.SignatureInformation(`${call.name}(${params.join(", ")})`);
			sigInfo.parameters = params.map((p) => new vscode.ParameterInformation(p));
			sigInfo.documentation = new vscode.MarkdownString("NLP++ user function");
		} else if (BUILTIN_SET.has(call.name.toLowerCase())) {
			// Built-in: no parameter table available, show a name-only signature.
			sigInfo = new vscode.SignatureInformation(`${call.name}( … )`);
			sigInfo.documentation = new vscode.MarkdownString("NLP++ built-in function");
		} else {
			return undefined;
		}

		const help = new vscode.SignatureHelp();
		help.signatures = [sigInfo];
		help.activeSignature = 0;
		help.activeParameter = Math.min(call.activeParam, Math.max(0, sigInfo.parameters.length - 1));
		return help;
	},
};

// ---- Semantic highlighting -------------------------------------------------

const SEM_TYPES: SemType[] = ["function", "method", "class", "type", "macro"];
export const semanticLegend = new vscode.SemanticTokensLegend(SEM_TYPES as string[]);
const SEM_INDEX = new Map<SemType, number>(SEM_TYPES.map((t, i) => [t, i]));

const semanticProvider: vscode.DocumentSemanticTokensProvider = {
	async provideDocumentSemanticTokens(doc) {
		await nlpWorkspaceIndex.ensureBuilt();
		const builder = new vscode.SemanticTokensBuilder(semanticLegend);
		const text = doc.getText();
		try {
			for (const t of classifyTokens(text, gatherSymbolSets())) {
				const pos = doc.positionAt(t.start);
				builder.push(pos.line, pos.character, t.length, SEM_INDEX.get(t.type)!, 0);
			}
		} catch { /* fall back to TextMate coloring */ }
		return builder.build();
	},
};

// ---- Quick fixes (misspelled function calls) -------------------------------

const UNKNOWN_FN_CODE = "nlp.unknown-function";

// Known callable names (built-ins + user functions) and a membership test that
// also treats keywords, node accessors, concepts, and rules as "known" so the
// unknown-call check only fires on genuine unrecognized calls.
function knownFunctions(sets: SymbolSets): { names: string[]; isKnown: (w: string) => boolean } {
	const names = [...BUILTIN_FUNCTIONS, ...sets.userFuncs];
	const isKnown = (w: string) =>
		sets.builtins.has(w.toLowerCase()) ||
		KEYWORD_SET.has(w.toLowerCase()) ||
		sets.letters.has(w) ||
		sets.userFuncs.has(w) ||
		sets.concepts.has(w) ||
		sets.rules.has(w);
	return { names, isKnown };
}

const codeActionProvider: vscode.CodeActionProvider = {
	provideCodeActions(doc, range, context) {
		const actions: vscode.CodeAction[] = [];
		for (const diag of context.diagnostics) {
			if (diag.code !== UNKNOWN_FN_CODE) continue;
			// Suggestion is encoded in the message: "... did you mean 'X'?"
			const m = /did you mean '([^']+)'/.exec(diag.message);
			if (!m) continue;
			const fix = new vscode.CodeAction(`Replace with '${m[1]}'`, vscode.CodeActionKind.QuickFix);
			fix.edit = new vscode.WorkspaceEdit();
			fix.edit.replace(doc.uri, diag.range, m[1]);
			fix.diagnostics = [diag];
			fix.isPreferred = true;
			actions.push(fix);
		}
		return actions;
	},
};

// ---- Diagnostics -----------------------------------------------------------

async function refreshDiagnostics(doc: vscode.TextDocument, collection: vscode.DiagnosticCollection): Promise<void> {
	if (doc.languageId !== "nlp") return;
	const text = doc.getText();
	let problems;
	try {
		problems = computeProblems(text);
	} catch {
		return;
	}
	const diags = problems.map((p) => {
		const d = new vscode.Diagnostic(
			new vscode.Range(doc.positionAt(p.start), doc.positionAt(p.end)),
			p.message,
			p.severity === "error"
				? vscode.DiagnosticSeverity.Error
				: vscode.DiagnosticSeverity.Warning,
		);
		d.source = "nlp++";
		d.code = p.code;
		return d;
	});

	// Misspelled function calls -> warning with a "did you mean" suggestion the
	// quick-fix reads back. Best-effort: needs the index for user functions.
	try {
		await nlpWorkspaceIndex.ensureBuilt();
		const { names, isKnown } = knownFunctions(gatherSymbolSets());
		for (const u of findUnknownCalls(text, isKnown, names)) {
			const d = new vscode.Diagnostic(
				new vscode.Range(doc.positionAt(u.start), doc.positionAt(u.start + u.length)),
				`Unknown function '${u.word}' — did you mean '${u.suggestion}'?`,
				vscode.DiagnosticSeverity.Warning,
			);
			d.source = "nlp++";
			d.code = UNKNOWN_FN_CODE;
			diags.push(d);
		}
	} catch { /* index unavailable; structural diagnostics still apply */ }

	collection.set(doc.uri, diags);
}

export function registerLanguageFeatures(ctx: vscode.ExtensionContext): void {
	ctx.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(NLP, symbolProvider),
		vscode.languages.registerHoverProvider(NLP, hoverProvider),
		vscode.languages.registerDefinitionProvider(NLP, definitionProvider),
		vscode.languages.registerWorkspaceSymbolProvider(workspaceSymbolProvider),
		vscode.languages.registerReferenceProvider(NLP, referenceProvider),
		vscode.languages.registerDocumentHighlightProvider(NLP, highlightProvider),
		vscode.languages.registerRenameProvider(NLP, renameProvider),
		vscode.languages.registerCompletionItemProvider(NLP, completionProvider, "@"),
		vscode.languages.registerSignatureHelpProvider(NLP, signatureProvider, "(", ","),
		vscode.languages.registerFoldingRangeProvider(NLP, foldingProvider),
		vscode.languages.registerDocumentSemanticTokensProvider(NLP, semanticProvider, semanticLegend),
		vscode.languages.registerCodeActionsProvider(NLP, codeActionProvider, {
			providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
		}),
	);

	// Keep the cross-pass index fresh. It builds lazily on first use; here we
	// just invalidate/update incrementally so navigation stays correct as files
	// change, are created, or are deleted.
	const watcher = vscode.workspace.createFileSystemWatcher("**/*.{nlp,pat,kbb}");
	ctx.subscriptions.push(
		watcher,
		watcher.onDidDelete((uri) => nlpWorkspaceIndex.removeFile(uri)),
		watcher.onDidCreate(() => { void nlpWorkspaceIndex.rebuild(); }),
		vscode.workspace.onDidSaveTextDocument((d) => {
			if (d.languageId === "nlp" || d.languageId === "kbb")
				nlpWorkspaceIndex.indexText(d.uri, d.getText());
		}),
	);

	const diagnostics = vscode.languages.createDiagnosticCollection("nlp++");
	ctx.subscriptions.push(diagnostics);

	// Debounce change-driven re-lint so large files don't re-parse on every keypress.
	const timers = new Map<string, ReturnType<typeof setTimeout>>();
	const scheduleRefresh = (doc: vscode.TextDocument) => {
		const key = doc.uri.toString();
		const existing = timers.get(key);
		if (existing) clearTimeout(existing);
		timers.set(key, setTimeout(() => {
			timers.delete(key);
			refreshDiagnostics(doc, diagnostics);
		}, 300));
	};

	if (vscode.window.activeTextEditor)
		refreshDiagnostics(vscode.window.activeTextEditor.document, diagnostics);

	ctx.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((doc) => refreshDiagnostics(doc, diagnostics)),
		vscode.workspace.onDidChangeTextDocument((e) => scheduleRefresh(e.document)),
		vscode.workspace.onDidCloseTextDocument((doc) => diagnostics.delete(doc.uri)),
	);
}
