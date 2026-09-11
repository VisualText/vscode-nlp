// The assertions themselves. Everything here runs inside the extension host,
// so `vscode` is live and the extension is loaded from source.

import * as vscode from "vscode";
import { check, eq, unreachable } from "./harness";
import { SEEDED_CONFIGURATIONS } from "../../debug/debugConfig";

const EXTENSION_ID = "dehilster.nlp";

// Declared in package.json contributes.languages.
const LANGUAGES = ["nlp", "txxt", "tree", "kbb", "dict", "kb", "seq"];

function extension(): vscode.Extension<unknown> | undefined {
	return vscode.extensions.getExtension(EXTENSION_ID);
}

// Every standard language feature is served by the language server, which is a
// separate process and therefore starts asynchronously -- activate() resolves
// before it is listening. Each provider group waits here first.
//
// activate() returns { languageServerReady } for exactly this reason. Sleeping
// instead would pass locally and flake on a loaded CI runner, and the failure
// mode is indistinguishable from a provider that was never registered: an empty
// array either way.
async function awaitLanguageServer(): Promise<void> {
	const ext = extension();
	if (!ext) return;
	if (!ext.isActive) await ext.activate();
	const api = ext.exports as { languageServerReady?: Promise<void> } | undefined;
	await api?.languageServerReady;
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
	await awaitLanguageServer();
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
// The language server binds twelve providers to { language: "nlp" }, and
// langTest.ts already covers the engines behind them. What it cannot cover is
// whether each one is reachable through VS Code for an .nlp document -- a
// provider registered against the wrong selector, not registered at all, or
// sitting behind a server that failed to start, all look identical to a provider
// that simply had nothing to say.
//
// So each check below uses input the engine is known to answer on, and requires
// a non-empty result. Asserting merely "an array came back" would pass just as
// happily with no provider registered, since VS Code returns an empty array in
// both cases.
//
// Definition, references and rename are not here because they need files on disk
// rather than an untitled buffer; they are covered in crossPassTests below.

async function openNlp(content: string): Promise<vscode.TextDocument> {
	return vscode.workspace.openTextDocument({ language: "nlp", content });
}

export async function languageFeatureTests(): Promise<void> {
	await awaitLanguageServer();
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

	// Cross-pass resolution is covered separately, in crossPassTests.

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

// ---- cross-pass resolution -------------------------------------------------
// Definition, references and rename resolve a name declared in ONE pass file
// from a use in ANOTHER, through nlpWorkspaceIndex. langTest.ts covers the
// symbol parsing in isolation; only a real workspace exercises the index that
// joins the files together, which is where the cross-pass logic actually lives.
//
// The fixture is two .nlp files written into the temp workspace by runTest.ts
// before VS Code starts: pass1_declares.nlp has `_fixtureSharedRule <- ... @@`
// and pass2_references.nlp uses that name on a rule's right-hand side.

const FIXTURE_RULE = "_fixtureSharedRule";
const FIXTURE_DECL_FILE = "pass1_declares.nlp";
const FIXTURE_REF_FILE = "pass2_references.nlp";

function fixtureUri(name: string): vscode.Uri | undefined {
	const folder = vscode.workspace.workspaceFolders?.[0];
	return folder ? vscode.Uri.joinPath(folder.uri, name) : undefined;
}

export async function crossPassTests(): Promise<void> {
	await awaitLanguageServer();
	const refUri = fixtureUri(FIXTURE_REF_FILE);
	const declUri = fixtureUri(FIXTURE_DECL_FILE);
	if (!refUri || !declUri) {
		unreachable("cross-pass definition resolves to the declaring file", "no workspace folder");
		return;
	}

	let refDoc: vscode.TextDocument;
	try {
		refDoc = await vscode.workspace.openTextDocument(refUri);
	} catch (err) {
		unreachable("cross-pass definition resolves to the declaring file", String(err));
		return;
	}

	// Position on the *use* of the shared rule in pass two.
	const useOffset = refDoc.getText().indexOf(FIXTURE_RULE);
	check(`${FIXTURE_REF_FILE} contains a use of ${FIXTURE_RULE}`, useOffset >= 0);
	if (useOffset < 0) return;
	const usePos = refDoc.positionAt(useOffset + 2);

	// Definition: must land in the other file, not merely return something.
	const defs = await vscode.commands.executeCommand<vscode.Location[]>(
		"vscode.executeDefinitionProvider",
		refUri,
		usePos
	);
	const landedInDecl = (defs ?? []).some((d) => d.uri.fsPath === declUri.fsPath);
	check(
		"cross-pass definition resolves to the declaring file",
		landedInDecl,
		`got ${(defs ?? []).length} location(s): ${(defs ?? []).map((d) => d.uri.path.split("/").pop()).join(", ") || "none"}`
	);

	// References: both the declaration and the use, in two different files.
	const refs = await vscode.commands.executeCommand<vscode.Location[]>(
		"vscode.executeReferenceProvider",
		refUri,
		usePos
	);
	const files = new Set((refs ?? []).map((r) => r.uri.fsPath));
	check(
		"references span both pass files",
		files.has(declUri.fsPath) && files.has(refUri.fsPath),
		`got ${(refs ?? []).length} reference(s) across ${files.size} file(s)`
	);

	// Rename: the edit has to reach the declaring file too, or renaming from a
	// use would leave the declaration behind and silently break the analyzer.
	// The provider rejects a name it cannot resolve -- "not a declared rule,
	// function, or concept" -- by throwing rather than returning nothing, so a
	// bare await would abort the group and lose the checks above it.
	let edit: vscode.WorkspaceEdit | undefined;
	try {
		edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
			"vscode.executeDocumentRenameProvider",
			refUri,
			usePos,
			"_fixtureRenamed"
		);
	} catch (err) {
		check("rename edits both pass files", false, `rename provider threw: ${String(err)}`);
		return;
	}
	const touched = edit ? edit.entries().map(([uri]) => uri.fsPath) : [];
	check(
		"rename edits both pass files",
		touched.includes(declUri.fsPath) && touched.includes(refUri.fsPath),
		`edits ${touched.length} file(s): ${touched.map((p) => p.split(/[\\/]/).pop()).join(", ") || "none"}`
	);
}
// ---- the debugger a first-time user meets ---------------------------------
//
// Every route into the debugger has to work with no editing, because an NLP++
// author has no reason to know what a launch.json is. There are three of them
// and they are seeded from two different places, which is exactly how they
// drift apart:
//
//   * "create a launch.json file" writes package.json's initialConfigurations
//     when the extension has not been activated, and the provider's
//     provideDebugConfigurations when it has. Those are two copies of one list.
//   * F5 with no launch.json at all goes through resolveDebugConfiguration.
//   * The Debug button in the Text view starts a session directly.
export async function debugSetupTests(): Promise<void> {
	const pkg = extension()?.packageJSON as any;
	const dbg = pkg?.contributes?.debuggers?.[0];

	check("an NLP++ debugger is contributed", !!dbg, JSON.stringify(Object.keys(pkg?.contributes ?? {})));
	if (!dbg) return;

	// Without this VS Code does not know the debugger has anything to do with
	// the file in front of the user, so it is not offered at all.
	check("it is associated with the nlp language",
		Array.isArray(dbg.languages) && dbg.languages.includes("nlp"),
		JSON.stringify(dbg.languages));

	const seeded = dbg.initialConfigurations as any[];
	check("creating a launch.json seeds configurations", Array.isArray(seeded) && seeded.length > 0);
	if (!Array.isArray(seeded) || !seeded.length) return;

	// VS Code runs the FIRST configuration when the user presses F5 after
	// creating the file. Replay reads the .tree dumps of a previous run, so it
	// needs one to have happened and cannot stop inside an @POST -- seeding it
	// first hands a beginner the one mode that looks broken.
	eq("the first one is the live debugger", seeded[0]?.mode, "live");
	check("all three routes are seeded", seeded.length === 3,
		seeded.map((c) => c.name).join(", "));
	check("attach is among them",
		seeded.some((c) => c.request === "attach"), seeded.map((c) => c.request).join(", "));

	// The whole point: paste it and go. Anything a user must replace by hand --
	// a machine-specific path, an empty required field -- fails here.
	for (const cfg of seeded) {
		const needsEditing = Object.entries(cfg).filter(([k, v]) =>
			typeof v === "string" && v.length > 0
			&& !v.startsWith("${command:")
			&& (v.includes("<") || v.includes("path/to") || /^[A-Za-z]:[\/]/.test(v) || v.startsWith("/"))
			&& k !== "name");
		check(`"${cfg.name}" needs no editing`, needsEditing.length === 0,
			JSON.stringify(needsEditing));
		check(`"${cfg.name}" names an analyzer`, typeof cfg.analyzer === "string" && cfg.analyzer.length > 0);
	}

	// The two seeds are written independently, in TypeScript and in JSON, and
	// nothing but this makes them agree.
	const fromCode = SEEDED_CONFIGURATIONS as any[];
	check("package.json and the provider seed the same configurations",
		JSON.stringify(fromCode) === JSON.stringify(seeded),
		`code: ${JSON.stringify(fromCode.map((c) => c.name))} / json: ${JSON.stringify(seeded.map((c) => c.name))}`);

	// The one-click route, for someone who never opens Run and Debug.
	const commands = await vscode.commands.getCommands(true);
	check("a Debug command exists outside the Run and Debug view",
		commands.includes("textView.debugAnalyzer"));
	const inTitle = (pkg?.contributes?.menus?.["view/title"] ?? []).some(
		(m: any) => m.command === "textView.debugAnalyzer");
	check("and it is a button on the Text view", inTitle);

	// The commands the seeded configurations substitute have to exist, or the
	// file resolves to empty strings and the session dies with a poor message.
	for (const cmd of ["nlp.currentAnalyzerDir", "nlp.currentTextFile"]) {
		check(`\${command:${cmd}} resolves`, commands.includes(cmd));
	}
}
