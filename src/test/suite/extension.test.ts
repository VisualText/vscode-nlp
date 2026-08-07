// The assertions themselves. Everything here runs inside the extension host,
// so `vscode` is live and the extension is loaded from source.

import * as vscode from "vscode";
import { check, eq, unreachable } from "./harness";

const EXTENSION_ID = "dehilster.nlp";

// Declared in package.json contributes.languages.
const LANGUAGES = ["nlp", "txxt", "tree", "kbb", "dict", "kb", "seq"];

function extension(): vscode.Extension<unknown> | undefined {
	return vscode.extensions.getExtension(EXTENSION_ID);
}

// ---- activation ------------------------------------------------------------
// A throw during activate() disables the extension silently: no command works,
// no view appears, and nothing in the pure-Node harnesses would notice.

export async function activationTests(): Promise<void> {
	const ext = extension();
	check(`extension ${EXTENSION_ID} is present`, ext !== undefined);
	if (!ext) {
		unreachable("extension activates", "extension not found");
		return;
	}

	// Report the stack, not just the message. An activation failure is the one
	// error here that explains every later failure, and "Cannot read properties
	// of undefined" without a frame is close to useless on a CI runner you
	// cannot attach a debugger to.
	try {
		await ext.activate();
	} catch (err) {
		check(
			"extension activates without throwing",
			false,
			err instanceof Error ? (err.stack ?? err.message) : String(err)
		);
		return;
	}
	eq("extension reports itself active", ext.isActive, true);

	// Diagnostic context for whoever reads a failure above: activation behaves
	// differently with and without a folder open, and CI opens one.
	const folders = vscode.workspace.workspaceFolders;
	check(
		"a workspace folder is open",
		folders !== undefined && folders.length > 0,
		`workspaceFolders = ${folders ? `[${folders.length}]` : "undefined"}`
	);
}

// ---- command registration --------------------------------------------------
// package.json declares 224 commands. One that is declared but never registered
// still appears in the palette and fails only when a user clicks it. This is
// worth more here than in most extensions, because extension.ts monkey-patches
// vscode.commands.registerCommand to instrument telemetry -- a mistake in that
// patch could drop registrations wholesale.

export async function commandTests(): Promise<void> {
	const ext = extension();
	if (!ext) {
		unreachable("declared commands are registered", "extension not found");
		return;
	}

	const declared: string[] = (ext.packageJSON?.contributes?.commands ?? [])
		.map((c: { command: string }) => c.command)
		.filter(Boolean);

	check("package.json declares commands", declared.length > 0, `found ${declared.length}`);

	const registered = new Set(await vscode.commands.getCommands(true));
	const missing = declared.filter((id) => !registered.has(id));

	check(
		`all ${declared.length} declared commands are registered`,
		missing.length === 0,
		missing.length
			? `${missing.length} missing: ${missing.slice(0, 10).join(", ")}` +
			  (missing.length > 10 ? ` (+${missing.length - 10} more)` : "")
			: undefined
	);
}

// ---- language registration -------------------------------------------------

export async function languageTests(): Promise<void> {
	const ids = await vscode.languages.getLanguages();
	for (const id of LANGUAGES) {
		check(`language "${id}" is registered`, ids.includes(id));
	}
}

// ---- configuration ---------------------------------------------------------
// A setting the extension writes has to be declared in contributes.configuration
// or VS Code rejects the write outright, leaving one line in the log and a value
// that never persists. analyzer.directory sat broken that way: written on every
// activation, declared nowhere, so the analyzer folder was re-derived from
// scratch each time. A declared property always reports a defaultValue.

const WRITTEN_SETTINGS: Array<[string, string]> = [
	["analyzer", "directory"],
	["analyzer", "current"],
	["textView", "fast"],
];

export async function configurationTests(): Promise<void> {
	for (const [section, key] of WRITTEN_SETTINGS) {
		const inspected = vscode.workspace.getConfiguration(section).inspect(key);
		check(
			`${section}.${key} is a registered configuration`,
			inspected !== undefined && inspected.defaultValue !== undefined,
			"declared in contributes.configuration? VS Code rejects writes to settings that are not"
		);
	}
}

// ---- provider wiring -------------------------------------------------------
// test:format proves the formatting engine is lossless over ~1000 real files.
// It cannot prove the DocumentFormattingEditProvider is bound to .nlp documents
// and hands those edits back to the editor. That is this check.

const SAMPLE_PASS = `@NODES _ROOT

@RULES
_item <- _xWILD [one match=(_xALPHA)] @@
`;

export async function providerTests(): Promise<void> {
	let doc: vscode.TextDocument;
	try {
		doc = await vscode.workspace.openTextDocument({ language: "nlp", content: SAMPLE_PASS });
	} catch (err) {
		unreachable("a formatting provider answers for .nlp documents", String(err));
		return;
	}

	eq("an untitled .nlp document reports languageId nlp", doc.languageId, "nlp");

	// Returns undefined when no provider is registered for the document.
	const edits = await vscode.commands.executeCommand<vscode.TextEdit[] | undefined>(
		"vscode.executeFormatDocumentProvider",
		doc.uri,
		{ tabSize: 4, insertSpaces: true }
	);
	check("a formatting provider answers for .nlp documents", Array.isArray(edits));

	const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | undefined>(
		"vscode.executeDocumentSymbolProvider",
		doc.uri
	);
	check("a document symbol provider answers for .nlp documents", Array.isArray(symbols));
}

// ---- language features -----------------------------------------------------
// registerLanguageFeatures() binds eleven providers to { language: "nlp" }, and
// langTest.ts already covers the engines behind them. What it cannot cover is
// whether each one is reachable through VS Code for an .nlp document -- a
// provider registered against the wrong selector, or not registered at all,
// looks identical to a provider that simply had nothing to say.
//
// So each check below uses input the engine is known to answer on, and requires
// a non-empty result. Asserting merely "an array came back" would pass just as
// happily with no provider registered, since VS Code returns an empty array in
// both cases.
//
// Definition, references and rename are deliberately absent: they resolve across
// passes via the workspace index, which needs a real analyzer on disk rather than
// an untitled buffer. langTest.ts exercises that logic directly.

async function openNlp(content: string): Promise<vscode.TextDocument> {
	return vscode.workspace.openTextDocument({ language: "nlp", content });
}

export async function languageFeatureTests(): Promise<void> {
	// Hover: over the @NODES region marker, which the provider documents.
	{
		const doc = await openNlp(SAMPLE_PASS);
		const pos = doc.positionAt(SAMPLE_PASS.indexOf("@NODES") + 3);
		const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
			"vscode.executeHoverProvider",
			doc.uri,
			pos
		);
		check(
			"hover answers on a region marker",
			Array.isArray(hovers) && hovers.length > 0,
			`got ${Array.isArray(hovers) ? `${hovers.length} hovers` : typeof hovers}`
		);
	}

	// Completion: after an "@", where the provider offers the region markers.
	{
		const content = `${SAMPLE_PASS}\n@`;
		const doc = await openNlp(content);
		const list = await vscode.commands.executeCommand<vscode.CompletionList>(
			"vscode.executeCompletionItemProvider",
			doc.uri,
			doc.positionAt(content.length),
			"@"
		);
		check(
			"completion offers region markers after @",
			(list?.items?.length ?? 0) > 0,
			`got ${list?.items?.length ?? 0} items`
		);
	}

	// Signature help: cursor inside a call in a @CODE region.
	{
		const content = '@CODE\n  strval( pnvar("x") )\n@@CODE\n';
		const doc = await openNlp(content);
		const help = await vscode.commands.executeCommand<vscode.SignatureHelp | undefined>(
			"vscode.executeSignatureHelpProvider",
			doc.uri,
			doc.positionAt(content.indexOf('"x"') + 1),
			"("
		);
		check(
			"signature help answers inside a call",
			(help?.signatures?.length ?? 0) > 0,
			`got ${help ? `${help.signatures.length} signatures` : "undefined"}`
		);
	}

	// Folding: the region structure of a pass file.
	{
		const doc = await openNlp(SAMPLE_PASS);
		const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
			"vscode.executeFoldingRangeProvider",
			doc.uri
		);
		check(
			"folding ranges cover the pass regions",
			Array.isArray(ranges) && ranges.length > 0,
			`got ${Array.isArray(ranges) ? ranges.length : typeof ranges} ranges`
		);
	}

	// Semantic tokens: the colouring layered over the TextMate grammar.
	//
	// Needs a @CODE region containing something classifiable from the *static*
	// tables -- a builtin (strlength) and a node accessor (L). Concepts, rules
	// and user functions are classified from the workspace index, which an
	// untitled buffer has nothing to contribute to, so a rules-only sample
	// produces zero tokens and says nothing about whether the provider is wired.
	{
		const content = '@CODE\n  x = strlength("a");\n  L("y");\n@@CODE\n';
		const doc = await openNlp(content);
		const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens | undefined>(
			"vscode.provideDocumentSemanticTokens",
			doc.uri
		);
		check(
			"semantic tokens are produced",
			(tokens?.data?.length ?? 0) > 0,
			`got ${tokens ? `${tokens.data.length} ints` : "undefined"}`
		);
	}
}
