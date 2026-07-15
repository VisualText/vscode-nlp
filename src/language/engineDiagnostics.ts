// Engine-error diagnostics: turn the analyzer's err.log into inline squiggles.
//
// After a compile or analyze run, nlp.exe writes located errors to
// <analyzer>/output/err.log (and cgerr.log). This module reads that file, maps
// each error to its source pass file (via the sequence) or .dict file, and
// publishes them into a DiagnosticCollection so they appear in the editor and
// the Problems panel -- the semantic complement to the structural linter in
// diagnostics.ts. Call refreshEngineDiagnostics() whenever err.log is refreshed.

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { visualText } from "../visualText";
import { parseEngineErrors, EngineError } from "./engineErrors";

let collection: vscode.DiagnosticCollection | undefined;

export function registerEngineDiagnostics(ctx: vscode.ExtensionContext): void {
	collection = vscode.languages.createDiagnosticCollection("nlp++ engine");
	ctx.subscriptions.push(collection);
}

// Resolve an engine error to the on-disk file it refers to. Pass errors go
// through the sequence (pass number -> .nlp uri); dict errors resolve under the
// analyzer's KB directory. Returns undefined if it can't be located.
function resolveTarget(err: EngineError): vscode.Uri | undefined {
	if (err.kind === "dict") {
		if (!err.dictFile) return undefined;
		const kbDir = visualText.analyzer.getKBDirectory().fsPath;
		if (!kbDir.length) return undefined;
		return vscode.Uri.file(path.join(kbDir, err.dictFile));
	}
	const uri = visualText.analyzer.seqFile.getUriByPassNumber(err.passNum);
	return uri.fsPath.length ? uri : undefined;
}

// Strip the leading "<passNum> <lineNum>" bookkeeping so the squiggle message
// reads as prose. Falls back to the raw line if the shape is unexpected.
function cleanMessage(raw: string): string {
	return raw.replace(/^\s*\d+\s+\d+\s+/, "").trim() || raw.trim();
}

export function refreshEngineDiagnostics(): void {
	if (!collection) return;
	collection.clear();

	try {
		if (!visualText.analyzer || !visualText.analyzer.isLoaded()) return;

		const byFile = new Map<string, vscode.Diagnostic[]>();
		// err.log lives in output/; cgerr is a log-dir tree file. Both share format.
		const sources = [
			visualText.analyzer.getOutputDirectory("err.log"),
			visualText.analyzer.treeFile("cgerr"),
		];

		for (const uri of sources) {
			if (!uri.fsPath.length || !fs.existsSync(uri.fsPath)) continue;
			let text: string;
			try {
				text = fs.readFileSync(uri.fsPath, "utf8");
			} catch {
				continue;
			}

			for (const err of parseEngineErrors(text)) {
				const target = resolveTarget(err);
				if (!target) continue;
				const line = Math.max(0, err.lineNum - 1);
				// End column is generous; VSCode clamps it to the real line length.
				const range = new vscode.Range(line, 0, line, 5000);
				const diag = new vscode.Diagnostic(
					range,
					cleanMessage(err.message),
					err.severity === "warning"
						? vscode.DiagnosticSeverity.Warning
						: vscode.DiagnosticSeverity.Error,
				);
				diag.source = "nlp++ engine";
				const key = target.fsPath;
				const list = byFile.get(key) ?? [];
				list.push(diag);
				byFile.set(key, list);
			}
		}

		for (const [fsPath, diags] of byFile) {
			collection.set(vscode.Uri.file(fsPath), diags);
		}
	} catch {
		// Diagnostics are best-effort; never let a parse/IO hiccup break a compile.
	}
}
