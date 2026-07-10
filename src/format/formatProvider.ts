// VSCode adapter for the NLP++ formatter. This is the ONLY file in src/format
// that imports 'vscode'; all formatting logic lives in the pure engine
// (formatter.ts et al.) so it can be corpus-tested without an Electron host.

import * as vscode from "vscode";
import { formatDocument, formatRegionsInRange } from "./formatter";
import { FormatOptions } from "./types";

// Resolve FormatOptions from the nlp.format.* settings, falling back to the
// editor's own indentation for the "editor" indent style.
function resolveOptions(
	document: vscode.TextDocument,
	fmt: vscode.FormattingOptions,
): Partial<FormatOptions> {
	const cfg = vscode.workspace.getConfiguration("nlp.format", document.uri);
	const indentStyle = cfg.get<string>("indentStyle", "tabs");
	const braceStyle = cfg.get<string>("braceStyle", "allman");

	let useTabs = true;
	let tabSize = cfg.get<number>("tabSize", 4);
	if (indentStyle === "spaces") {
		useTabs = false;
	} else if (indentStyle === "editor") {
		useTabs = !fmt.insertSpaces;
		tabSize = fmt.tabSize;
	} else {
		useTabs = true; // "tabs"
	}

	const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
	return { useTabs, tabSize, braceAllman: braceStyle !== "keep", eol };
}

// Format the whole document and return it as a single replacement edit. VSCode
// diffs this against the buffer to produce a minimal, undo-friendly change and
// preserves the cursor as best it can.
function fullDocumentEdit(
	document: vscode.TextDocument,
	fmt: vscode.FormattingOptions,
): vscode.TextEdit[] {
	const cfg = vscode.workspace.getConfiguration("nlp.format", document.uri);
	if (!cfg.get<boolean>("enable", true)) return [];

	const original = document.getText();
	const formatted = formatDocument(original, resolveOptions(document, fmt));
	if (formatted === original) return [];

	const fullRange = new vscode.Range(
		document.positionAt(0),
		document.positionAt(original.length),
	);
	return [vscode.TextEdit.replace(fullRange, formatted)];
}

// Format only the regions the selection touches. Region granularity is
// intentional (see formatRegionsInRange): code indentation needs whole-region
// brace context. Returns one replace edit per changed region.
function rangeEdits(
	document: vscode.TextDocument,
	range: vscode.Range,
	fmt: vscode.FormattingOptions,
): vscode.TextEdit[] {
	const cfg = vscode.workspace.getConfiguration("nlp.format", document.uri);
	if (!cfg.get<boolean>("enable", true)) return [];

	const src = document.getText();
	const start = document.offsetAt(range.start);
	const end = document.offsetAt(range.end);
	return formatRegionsInRange(src, start, end, resolveOptions(document, fmt)).map((e) =>
		vscode.TextEdit.replace(
			new vscode.Range(document.positionAt(e.start), document.positionAt(e.end)),
			e.newText,
		),
	);
}

const documentProvider: vscode.DocumentFormattingEditProvider = {
	provideDocumentFormattingEdits(document, options) {
		return fullDocumentEdit(document, options);
	},
};

const rangeProvider: vscode.DocumentRangeFormattingEditProvider = {
	provideDocumentRangeFormattingEdits(document, range, options) {
		return rangeEdits(document, range, options);
	},
};

export function registerFormatter(ctx: vscode.ExtensionContext): void {
	// 'nlp' is the language id for both .nlp and .pat files.
	ctx.subscriptions.push(
		vscode.languages.registerDocumentFormattingEditProvider("nlp", documentProvider),
		vscode.languages.registerDocumentRangeFormattingEditProvider("nlp", rangeProvider),
	);
}
