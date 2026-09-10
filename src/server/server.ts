// NLP++ language server.
//
// This process owns every standard language feature: outline, hover, definition,
// references, rename, completion, signature help, folding, semantic tokens,
// quick fixes, structural diagnostics and formatting. It replaces the in-process
// VSCode providers that used to live in src/language/providers.ts and
// src/format/formatProvider.ts.
//
// It imports NOTHING from 'vscode'. All analysis still comes from the pure
// modules in src/language and src/format -- this file is the LSP adapter over
// them, exactly as providers.ts was the VSCode adapter. Because it is plain
// Node, any LSP-speaking editor (Neovim, Emacs, Sublime, JetBrains via LSP4IJ)
// can run it: point the client at dist/server.js with `--stdio`.
//
// Telemetry cannot live here (the telemetry module needs VSCode settings and the
// machine id), so the server emits a `nlp/telemetry` notification and the client
// records it. The "count a hit only when the feature produced something"
// semantics of the old counted() wrapper are preserved by counting at the point
// each handler returns a non-empty result.

import {
	createConnection, TextDocuments, ProposedFeatures, InitializeParams,
	InitializeResult, TextDocumentSyncKind, DocumentSymbol, SymbolKind,
	Hover, MarkupKind, Location, SymbolInformation, CompletionItem,
	CompletionItemKind, SignatureHelp, SignatureInformation, ParameterInformation,
	FoldingRange, FoldingRangeKind, SemanticTokensBuilder, CodeAction,
	CodeActionKind, Diagnostic, DiagnosticSeverity, TextEdit, WorkspaceEdit,
	DocumentHighlight, ResponseError, ErrorCodes, Range as LspRange, Position as LspPosition,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";

import { analyzeSymbols, declaredSymbols, NlpSymbol } from "../language/symbols";
import { computeProblems } from "../language/diagnostics";
import { regionKindAt, RegionKind } from "../language/completion";
import { findEnclosingCall } from "../language/signature";
import { foldingRanges } from "../language/folding";
import { classifyTokens, SymbolSets, SemType } from "../language/semanticTokens";
import { findUnknownCalls } from "../language/quickfix";
import {
	BUILTIN_SET, BUILTIN_FUNCTIONS, KEYWORDS, KEYWORD_SET, RULE_KEYWORDS,
	REGION_MARKERS, LETTER_FUNCTIONS,
} from "../language/nlpxxData";
import { formatDocument, formatRegionsInRange } from "../format/formatter";
import { FormatOptions } from "../format/types";
import { nlpWorkspaceIndex, IndexedSymbol } from "./workspaceIndex";
import { LineIndex } from "./lineIndex";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// ---- Telemetry relay --------------------------------------------------------

function count(id: string): void {
	connection.sendNotification("nlp/telemetry", { kind: "count", id });
}
function sendEvent(id: string, metrics: Record<string, number>): void {
	connection.sendNotification("nlp/telemetry", { kind: "event", id, metrics });
}
function sendError(id: string, reason: string, metrics: Record<string, number>): void {
	connection.sendNotification("nlp/telemetry", { kind: "error", id, reason, metrics });
}

// ---- Word extraction --------------------------------------------------------

// The server has no getWordRangeAtPosition, so mirror the wordPattern declared in
// nlp-configuration.json. Keeping the two in sync matters: it decides what counts
// as one identifier for hover, definition, references and rename.
const WORD_PATTERN = /(-?\d*\.\d\w*)|([^`~!@#%^&*()=+[{\]}\\|;:'",.<>/?\s]+)/g;

interface WordHit {
	word: string;
	range: LspRange;
	offset: number;
}

// The text of one line, without its terminator.
//
// The obvious spelling of this -- ending the range at {line, character: MAX} --
// is wrong: offsetAt() clamps to the length of the DOCUMENT, not the line, so on
// any line but the last it returns everything from the line start to the end of
// the file. Asking for the start of the next line clamps correctly, and the
// trailing newline is then trimmed off.
function lineTextAt(doc: TextDocument, line: number): string {
	return doc
		.getText({ start: { line, character: 0 }, end: { line: line + 1, character: 0 } })
		.replace(/\r?\n$/, "");
}

function wordAt(doc: TextDocument, pos: LspPosition): WordHit | undefined {
	const lineText = lineTextAt(doc, pos.line);
	WORD_PATTERN.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = WORD_PATTERN.exec(lineText)) !== null) {
		const start = m.index;
		const end = start + m[0].length;
		if (pos.character >= start && pos.character <= end) {
			return {
				word: m[0],
				range: { start: { line: pos.line, character: start }, end: { line: pos.line, character: end } },
				offset: doc.offsetAt({ line: pos.line, character: start }),
			};
		}
	}
	return undefined;
}

// ---- Settings ---------------------------------------------------------------

interface FormatSettings {
	enable: boolean;
	indentStyle: string;
	braceStyle: string;
	tabSize: number;
}

const DEFAULT_FORMAT: FormatSettings = {
	enable: true, indentStyle: "tabs", braceStyle: "allman", tabSize: 4,
};

// Cached per-resource so formatting doesn't round-trip a configuration request
// on every keystroke-triggered format-on-type. Invalidated wholesale on
// didChangeConfiguration, which is rare.
const formatSettingsCache = new Map<string, FormatSettings>();

// Whether the client advertised workspace/configuration support. It must be
// checked before asking: a client that does not support the request is under no
// obligation to answer it, and an unanswered request never settles -- which
// would hang formatting forever rather than falling back to defaults. VSCode
// always supports it; a minimal Neovim or Emacs client may not.
let hasConfigurationCapability = false;

async function formatSettings(uri: string): Promise<FormatSettings> {
	const hit = formatSettingsCache.get(uri);
	if (hit) return hit;
	let resolved = DEFAULT_FORMAT;
	if (hasConfigurationCapability) {
		try {
			const cfg = await connection.workspace.getConfiguration({ scopeUri: uri, section: "nlp.format" });
			if (cfg) resolved = { ...DEFAULT_FORMAT, ...cfg };
		} catch {
			// Client declined; defaults are correct.
		}
	}
	formatSettingsCache.set(uri, resolved);
	return resolved;
}

function resolveFormatOptions(
	doc: TextDocument,
	settings: FormatSettings,
	insertSpaces: boolean,
	editorTabSize: number,
): Partial<FormatOptions> {
	let useTabs = true;
	let tabSize = settings.tabSize;
	if (settings.indentStyle === "spaces") {
		useTabs = false;
	} else if (settings.indentStyle === "editor") {
		useTabs = !insertSpaces;
		tabSize = editorTabSize;
	}
	// TextDocument normalises nothing, so infer EOL from the text itself -- the
	// same thing the VSCode adapter got for free from document.eol.
	const eol = doc.getText().includes("\r\n") ? "\r\n" : "\n";
	return { useTabs, tabSize, braceAllman: settings.braceStyle !== "keep", eol };
}

// ---- Symbol sets ------------------------------------------------------------

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

// ---- Initialize -------------------------------------------------------------

const SEM_TYPES: SemType[] = ["function", "method", "class", "type", "macro"];
const SEM_INDEX = new Map<SemType, number>(SEM_TYPES.map((t, i) => [t, i]));

connection.onInitialize((params: InitializeParams): InitializeResult => {
	const roots: string[] = [];
	if (params.workspaceFolders) {
		for (const f of params.workspaceFolders) roots.push(URI.parse(f.uri).fsPath);
	} else if (params.rootUri) {
		roots.push(URI.parse(params.rootUri).fsPath);
	}
	nlpWorkspaceIndex.setRoots(roots);
	hasConfigurationCapability = params.capabilities.workspace?.configuration === true;

	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			documentSymbolProvider: true,
			hoverProvider: true,
			definitionProvider: true,
			workspaceSymbolProvider: true,
			referencesProvider: true,
			documentHighlightProvider: true,
			renameProvider: { prepareProvider: true },
			completionProvider: { triggerCharacters: ["@"], resolveProvider: false },
			signatureHelpProvider: { triggerCharacters: ["(", ","] },
			foldingRangeProvider: true,
			documentFormattingProvider: true,
			documentRangeFormattingProvider: true,
			codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix] },
			semanticTokensProvider: {
				legend: { tokenTypes: SEM_TYPES as string[], tokenModifiers: [] },
				full: true,
			},
			workspace: { workspaceFolders: { supported: true, changeNotifications: true } },
		},
	};
});

connection.onInitialized(() => {
	// Warm the index in the background so the first navigation is not the one
	// that pays for the workspace scan.
	void nlpWorkspaceIndex.ensureBuilt();
});

connection.onDidChangeConfiguration(() => {
	formatSettingsCache.clear();
	for (const doc of documents.all()) void refreshDiagnostics(doc);
});

// ---- Outline / breadcrumbs --------------------------------------------------

function kindOf(sym: NlpSymbol): SymbolKind {
	switch (sym.kind) {
		case "region": return SymbolKind.Namespace;
		case "rule": return SymbolKind.Function;
		case "function": return SymbolKind.Method;
	}
}

function toDocSymbol(lines: LineIndex, sym: NlpSymbol): DocumentSymbol {
	const range = lines.range(sym.start, sym.end);
	const selRaw = lines.range(sym.selStart, sym.selEnd);
	// selectionRange must be contained in range; clamp defensively.
	const contained = sym.selStart >= sym.start && sym.selEnd <= sym.end;
	return {
		name: sym.name,
		detail: sym.detail,
		kind: kindOf(sym),
		range,
		selectionRange: contained ? selRaw : { start: range.start, end: range.start },
		children: sym.children.map((c) => toDocSymbol(lines, c)),
	};
}

connection.onDocumentSymbol((params) => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return [];
	try {
		const text = doc.getText();
		const lines = new LineIndex(text);
		return analyzeSymbols(text).map((s) => toDocSymbol(lines, s));
	} catch {
		return [];
	}
});

// ---- Hover ------------------------------------------------------------------

function markerAtPosition(doc: TextDocument, pos: LspPosition): string | undefined {
	// If the cursor is on an @DIRECTIVE, return the bare keyword (e.g. "RULES").
	const line = lineTextAt(doc, pos.line);
	const m = /@@?([A-Za-z]+)/g;
	let hit: RegExpExecArray | null;
	while ((hit = m.exec(line)) !== null) {
		if (pos.character >= hit.index && pos.character <= hit.index + hit[0].length) {
			return hit[1].toUpperCase();
		}
	}
	return undefined;
}

connection.onHover((params): Hover | undefined => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return undefined;

	const marker = markerAtPosition(doc, params.position);
	if (marker && REGION_MARKERS[marker]) {
		count("hover");
		return { contents: { kind: MarkupKind.Markdown, value: `**@${marker}** — region\n\n${REGION_MARKERS[marker]}` } };
	}

	const hit = wordAt(doc, params.position);
	if (!hit) return undefined;
	const { word, range } = hit;
	const lower = word.toLowerCase();

	if (LETTER_FUNCTIONS[word]) {
		count("hover");
		return {
			contents: { kind: MarkupKind.Markdown, value: `**${word}** — node accessor\n\n${LETTER_FUNCTIONS[word]}` },
			range,
		};
	}
	if (BUILTIN_SET.has(lower)) {
		// Deep-link to the function's own help page (Help/markdown/<name>.md).
		// The command URI only renders as a link if the client marks the markdown
		// trusted -- the client middleware does that (see src/client).
		const arg = encodeURIComponent(JSON.stringify([word]));
		count("hover");
		return {
			contents: {
				kind: MarkupKind.Markdown,
				value: `**${word}** — NLP++ built-in function\n\n` +
					`[Open help for \`${word}\`](command:helpView.openFunctionPage?${arg})`,
			},
			range,
		};
	}
	if (KEYWORD_SET.has(lower)) {
		count("hover");
		return { contents: { kind: MarkupKind.Markdown, value: `**${word}** — NLP++ keyword` }, range };
	}
	return undefined;
});

// ---- Go to definition -------------------------------------------------------

connection.onDefinition(async (params): Promise<Location[]> => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return [];
	const hit = wordAt(doc, params.position);
	if (!hit) return [];
	const locations: Location[] = [];

	// Same-file declarations (parsed live so unsaved edits resolve correctly).
	try {
		const text = doc.getText();
		const lines = new LineIndex(text);
		for (const d of declaredSymbols(text)) {
			if (d.name === hit.word) {
				locations.push({ uri: doc.uri, range: lines.range(d.selStart, d.selEnd) });
			}
		}
	} catch { /* fall through to the cross-file index */ }

	// Cross-pass declarations from the workspace index (other .nlp/.pat files).
	await nlpWorkspaceIndex.ensureBuilt();
	for (const s of nlpWorkspaceIndex.lookup(hit.word)) {
		if (s.uri === doc.uri) continue; // same-file handled above
		locations.push({ uri: s.uri, range: s.range });
	}
	if (locations.length) count("definition");
	return locations;
});

// ---- Workspace symbols (Ctrl-T) --------------------------------------------

function wsKind(sym: IndexedSymbol): SymbolKind {
	if (sym.kind === "concept") return SymbolKind.Class;
	if (sym.kind === "function") return SymbolKind.Method;
	return SymbolKind.Function;
}

connection.onWorkspaceSymbol(async (params): Promise<SymbolInformation[]> => {
	await nlpWorkspaceIndex.ensureBuilt();
	return nlpWorkspaceIndex.search(params.query).map((s) => ({
		name: s.name,
		kind: wsKind(s),
		location: { uri: s.uri, range: s.range },
	}));
});

// ---- Find all references ----------------------------------------------------

connection.onReferences(async (params): Promise<Location[]> => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return [];
	const hit = wordAt(doc, params.position);
	if (!hit) return [];
	await nlpWorkspaceIndex.ensureBuilt();

	const locations: Location[] = nlpWorkspaceIndex.references(hit.word)
		.map((r) => ({ uri: r.uri, range: r.range }));
	if (params.context.includeDeclaration) {
		for (const d of nlpWorkspaceIndex.lookup(hit.word)) {
			locations.push({ uri: d.uri, range: d.range });
		}
	}
	if (locations.length) count("references");
	return locations;
});

// ---- Occurrence highlighting (current file) ---------------------------------

connection.onDocumentHighlight((params): DocumentHighlight[] => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return [];
	const hit = wordAt(doc, params.position);
	if (!hit) return [];
	const out: DocumentHighlight[] = [];
	for (const r of nlpWorkspaceIndex.references(hit.word)) {
		if (r.uri === doc.uri) out.push({ range: r.range });
	}
	return out;
});

// ---- Rename -----------------------------------------------------------------

// Rename is name-based (it rewrites every identifier occurrence with the same
// text) so it is gated: only a symbol that is actually DECLARED somewhere -- a
// rule, an @DECL function, or a .kbb concept -- may be renamed. Built-ins,
// keywords, and undeclared words are rejected, which keeps the edit from
// sweeping up unrelated identifiers that merely share a name.
connection.onPrepareRename(async (params) => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return null;
	const hit = wordAt(doc, params.position);
	if (!hit) throw new ResponseError(ErrorCodes.InvalidRequest, "You cannot rename this element.");
	const lower = hit.word.toLowerCase();
	if (BUILTIN_SET.has(lower) || KEYWORD_SET.has(lower)) {
		throw new ResponseError(ErrorCodes.InvalidRequest, "Cannot rename an NLP++ built-in or keyword.");
	}
	await nlpWorkspaceIndex.ensureBuilt();
	nlpWorkspaceIndex.indexText(doc.uri, doc.getText()); // cover unsaved edits
	if (nlpWorkspaceIndex.lookup(hit.word).length === 0) {
		throw new ResponseError(ErrorCodes.InvalidRequest,
			`"${hit.word}" is not a declared rule, function, or concept.`);
	}
	return hit.range;
});

connection.onRenameRequest(async (params): Promise<WorkspaceEdit | undefined> => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return undefined;
	const hit = wordAt(doc, params.position);
	if (!hit) return undefined;
	await nlpWorkspaceIndex.ensureBuilt();
	nlpWorkspaceIndex.indexText(doc.uri, doc.getText());

	const changes: Record<string, TextEdit[]> = {};
	const seen = new Set<string>();
	const add = (uri: string, range: LspRange) => {
		const key = `${uri}:${range.start.line}:${range.start.character}`;
		if (seen.has(key)) return;
		seen.add(key);
		(changes[uri] ??= []).push({ range, newText: params.newName });
	};
	for (const ref of nlpWorkspaceIndex.references(hit.word)) add(ref.uri, ref.range);
	for (const d of nlpWorkspaceIndex.lookup(hit.word)) add(d.uri, d.range);
	if (Object.keys(changes).length) count("rename");
	return { changes };
});

// ---- Completion -------------------------------------------------------------

function staticItem(label: string, kind: CompletionItemKind, detail: string, doc?: string): CompletionItem {
	const item: CompletionItem = { label, kind, detail };
	if (doc) item.documentation = { kind: MarkupKind.Markdown, value: doc };
	return item;
}

const BUILTIN_ITEMS = BUILTIN_FUNCTIONS.map((f) =>
	staticItem(f, CompletionItemKind.Function, "NLP++ built-in function"));
const KEYWORD_ITEMS = KEYWORDS.map((k) =>
	staticItem(k, CompletionItemKind.Keyword, "NLP++ keyword"));
const RULE_KEYWORD_ITEMS = RULE_KEYWORDS.map((k) =>
	staticItem(k, CompletionItemKind.Keyword, "rule-element modifier"));
const LETTER_ITEMS = Object.entries(LETTER_FUNCTIONS).map(([name, doc]) =>
	staticItem(name, CompletionItemKind.Function, "node accessor", doc));
const REGION_ITEMS = Object.entries(REGION_MARKERS).map(([name, doc]) =>
	staticItem(name, CompletionItemKind.Keyword, "@region marker", doc));

// Index-derived items (rules / functions / concepts) rebuilt per request so new
// declarations show up. Deduped by name so a symbol declared in many passes
// appears once.
function indexItems(kinds: Set<string>): CompletionItem[] {
	const seen = new Set<string>();
	const out: CompletionItem[] = [];
	for (const s of nlpWorkspaceIndex.search("")) {
		if (!kinds.has(s.kind) || seen.has(s.name)) continue;
		seen.add(s.name);
		const kind = s.kind === "concept" ? CompletionItemKind.Class
			: s.kind === "function" ? CompletionItemKind.Method
			: CompletionItemKind.Function;
		out.push(staticItem(s.name, kind, `NLP++ ${s.kind}`));
	}
	return out;
}

connection.onCompletion(async (params): Promise<CompletionItem[]> => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return [];
	const pos = params.position;
	const linePrefix = doc.getText({
		start: { line: pos.line, character: 0 },
		end: pos,
	});

	// Typing an "@directive": offer region markers (e.g. @RULES, @CODE).
	if (/@@?\w*$/.test(linePrefix)) {
		count("completion");
		return REGION_ITEMS;
	}

	await nlpWorkspaceIndex.ensureBuilt();
	const region = regionKindAt(doc.getText(), doc.offsetAt(pos));

	count("completion");
	if (region === RegionKind.Rules) {
		// Rule element context: modifiers + concepts + rule names.
		return [...RULE_KEYWORD_ITEMS, ...indexItems(new Set(["concept", "rule"]))];
	}

	// Code (and Other/Preamble fallback): functions + keywords + accessors +
	// user-declared functions.
	return [...BUILTIN_ITEMS, ...KEYWORD_ITEMS, ...LETTER_ITEMS, ...indexItems(new Set(["function"]))];
});

// ---- Folding ----------------------------------------------------------------

connection.onFoldingRanges((params): FoldingRange[] => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return [];
	try {
		return foldingRanges(doc.getText()).map((r) => ({
			startLine: r.start,
			endLine: r.end,
			kind: r.kind === "comment" ? FoldingRangeKind.Comment : FoldingRangeKind.Region,
		}));
	} catch {
		return [];
	}
});

// ---- Signature help ---------------------------------------------------------

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

connection.onSignatureHelp(async (params): Promise<SignatureHelp | undefined> => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return undefined;
	const call = findEnclosingCall(doc.getText(), doc.offsetAt(params.position));
	if (!call) return undefined;
	await nlpWorkspaceIndex.ensureBuilt();

	// Prefer a user-declared function with a known parameter list.
	const decl = nlpWorkspaceIndex.lookup(call.name)
		.find((s) => s.kind === "function" && s.signature !== undefined);
	let sigInfo: SignatureInformation;
	if (decl) {
		const params2 = splitParams(decl.signature ?? "");
		sigInfo = {
			label: `${call.name}(${params2.join(", ")})`,
			parameters: params2.map((p): ParameterInformation => ({ label: p })),
			documentation: { kind: MarkupKind.Markdown, value: "NLP++ user function" },
		};
	} else if (BUILTIN_SET.has(call.name.toLowerCase())) {
		// Built-in: no parameter table available, show a name-only signature.
		sigInfo = {
			label: `${call.name}( … )`,
			parameters: [],
			documentation: { kind: MarkupKind.Markdown, value: "NLP++ built-in function" },
		};
	} else {
		return undefined;
	}

	count("signature");
	return {
		signatures: [sigInfo],
		activeSignature: 0,
		activeParameter: Math.min(call.activeParam, Math.max(0, (sigInfo.parameters?.length ?? 0) - 1)),
	};
});

// ---- Semantic highlighting --------------------------------------------------

connection.languages.semanticTokens.on(async (params) => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return { data: [] };
	await nlpWorkspaceIndex.ensureBuilt();
	const builder = new SemanticTokensBuilder();
	const text = doc.getText();
	try {
		const lines = new LineIndex(text);
		for (const t of classifyTokens(text, gatherSymbolSets())) {
			const pos = lines.position(t.start);
			builder.push(pos.line, pos.character, t.length, SEM_INDEX.get(t.type)!, 0);
		}
	} catch { /* fall back to TextMate coloring */ }
	return builder.build();
});

// ---- Quick fixes ------------------------------------------------------------

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

connection.onCodeAction((params): CodeAction[] => {
	const actions: CodeAction[] = [];
	for (const diag of params.context.diagnostics) {
		if (diag.code !== UNKNOWN_FN_CODE) continue;
		// Suggestion is encoded in the message: "... did you mean 'X'?"
		const m = /did you mean '([^']+)'/.exec(diag.message);
		if (!m) continue;
		actions.push({
			title: `Replace with '${m[1]}'`,
			kind: CodeActionKind.QuickFix,
			diagnostics: [diag],
			isPreferred: true,
			edit: { changes: { [params.textDocument.uri]: [{ range: diag.range, newText: m[1] }] } },
		});
	}
	return actions;
});

// ---- Formatting -------------------------------------------------------------

connection.onDocumentFormatting(async (params): Promise<TextEdit[]> => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return [];
	const settings = await formatSettings(doc.uri);
	if (!settings.enable) return [];

	const original = doc.getText();
	let formatted: string;
	try {
		formatted = formatDocument(original,
			resolveFormatOptions(doc, settings, params.options.insertSpaces, params.options.tabSize));
	} catch {
		// The formatter is designed never to throw; if it somehow does, don't
		// corrupt the buffer -- report a scrubbed error and make no edit.
		sendError("format.error", "document", { bytes: original.length });
		return [];
	}
	// Anonymous: byte count and a changed/unchanged flag only -- no content.
	sendEvent("format.document", {
		bytes: original.length,
		changed: formatted === original ? 0 : 1,
	});
	if (formatted === original) return [];

	const lines = new LineIndex(original);
	return [{ range: lines.range(0, original.length), newText: formatted }];
});

connection.onDocumentRangeFormatting(async (params): Promise<TextEdit[]> => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return [];
	const settings = await formatSettings(doc.uri);
	if (!settings.enable) return [];

	const src = doc.getText();
	const start = doc.offsetAt(params.range.start);
	const end = doc.offsetAt(params.range.end);
	let regionEdits;
	try {
		regionEdits = formatRegionsInRange(src, start, end,
			resolveFormatOptions(doc, settings, params.options.insertSpaces, params.options.tabSize));
	} catch {
		sendError("format.error", "selection", { bytes: end - start });
		return [];
	}
	sendEvent("format.selection", { bytes: end - start, edits: regionEdits.length });
	const lines = new LineIndex(src);
	return regionEdits.map((e) => ({ range: lines.range(e.start, e.end), newText: e.newText }));
});

// ---- Diagnostics ------------------------------------------------------------

async function refreshDiagnostics(doc: TextDocument): Promise<void> {
	if (doc.languageId !== "nlp") return;
	const text = doc.getText();
	let problems;
	try {
		problems = computeProblems(text);
	} catch {
		return;
	}
	const lines = new LineIndex(text);
	const diags: Diagnostic[] = problems.map((p) => ({
		range: lines.range(p.start, p.end),
		message: p.message,
		severity: p.severity === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
		source: "nlp++",
		code: p.code,
	}));

	// Misspelled function calls -> warning with a "did you mean" suggestion the
	// quick-fix reads back. Best-effort: needs the index for user functions.
	try {
		await nlpWorkspaceIndex.ensureBuilt();
		const { names, isKnown } = knownFunctions(gatherSymbolSets());
		for (const u of findUnknownCalls(text, isKnown, names)) {
			diags.push({
				range: lines.range(u.start, u.start + u.length),
				message: `Unknown function '${u.word}' — did you mean '${u.suggestion}'?`,
				severity: DiagnosticSeverity.Warning,
				source: "nlp++",
				code: UNKNOWN_FN_CODE,
			});
		}
	} catch { /* index unavailable; structural diagnostics still apply */ }

	connection.sendDiagnostics({ uri: doc.uri, diagnostics: diags });
}

// Debounce change-driven re-lint so large files don't re-parse on every keypress.
const timers = new Map<string, ReturnType<typeof setTimeout>>();
function scheduleRefresh(doc: TextDocument): void {
	const existing = timers.get(doc.uri);
	if (existing) clearTimeout(existing);
	timers.set(doc.uri, setTimeout(() => {
		timers.delete(doc.uri);
		void refreshDiagnostics(doc);
	}, 300));
}

documents.onDidOpen((e) => {
	nlpWorkspaceIndex.indexText(e.document.uri, e.document.getText());
	void refreshDiagnostics(e.document);
});

documents.onDidChangeContent((e) => scheduleRefresh(e.document));

documents.onDidSave((e) => {
	// Keep the cross-pass index fresh: a saved pass file may declare new rules.
	nlpWorkspaceIndex.indexText(e.document.uri, e.document.getText());
});

documents.onDidClose((e) => {
	const uri = e.document.uri;
	const timer = timers.get(uri);
	if (timer) clearTimeout(timer);
	timers.delete(uri);
	connection.sendDiagnostics({ uri, diagnostics: [] });

	// An untitled buffer stops existing when it closes, so its symbols must go
	// with it or they haunt Ctrl-T and go-to-definition pointing at nothing. A
	// file-backed document is still on disk and stays indexed -- but re-read it,
	// since what we hold is whatever unsaved edits it had when it closed.
	if (uri.startsWith("untitled:")) nlpWorkspaceIndex.removeFile(uri);
	else nlpWorkspaceIndex.indexUri(uri);
});

// Files created/deleted outside the editor (an analyzer run writes KB files).
// A created file indexes only ITSELF -- this used to trigger a full workspace
// rebuild, so an analyzer run kicked off repeated full rebuilds that tied up the
// host and made opening files feel slow.
connection.onDidChangeWatchedFiles((params) => {
	for (const change of params.changes) {
		// 3 === Deleted in the LSP FileChangeType enum.
		if (change.type === 3) nlpWorkspaceIndex.removeFile(change.uri);
		else if (!/(^|\/)(node_modules|output|[^/]*_log)\//.test(change.uri)) {
			nlpWorkspaceIndex.indexUri(change.uri);
		}
	}
});

documents.listen(connection);
connection.listen();
