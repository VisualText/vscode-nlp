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
