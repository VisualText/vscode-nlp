// Pure parser for the NLP++ engine's err.log / cgerr error format.
//
// PURE MODULE: no 'vscode' import. The engine writes located errors as lines of
//   "<passNum> <lineNum> <message...>"           (a rule/pass-file error)
//   "<dictLine> <col> [message - <file>.dict]"    (a dictionary-file error)
// This mirrors the detection already done by LogView.parseLogLine (logView.ts),
// factored out so it can be reused to populate a diagnostics collection and be
// unit-tested without an Electron host. Keep in sync with parseLogLine.

export type EngineErrorKind = "pass" | "dict";
export type EngineSeverity = "error" | "warning";

export interface EngineError {
	kind: EngineErrorKind;
	passNum: number;   // pass file number (kind === "pass")
	lineNum: number;   // 1-based line within the target file
	dictFile?: string; // basename of the .dict (kind === "dict")
	message: string;   // the full raw line, shown as the diagnostic message
	severity: EngineSeverity;
}

// Parse a single err.log line. Returns undefined when the line is not a located
// error (no leading "<num> <num>" pair) -- those are progress/info lines.
export function parseEngineErrorLine(raw: string): EngineError | undefined {
	const trimmed = raw.trim();
	if (!trimmed.length) return undefined;

	const tokens = trimmed.split(/[\t ]+/);
	if (tokens.length < 2) return undefined;

	const passNum = Number(tokens[0]);
	const lineNum = Number(tokens[1]);
	// Same guard as parseLogLine: both must be numbers, line must be non-zero.
	if (!Number.isFinite(passNum) || !Number.isFinite(lineNum) || passNum < 0 || lineNum === 0) {
		return undefined;
	}

	const lower = trimmed.toLowerCase();
	const severity: EngineSeverity = lower.indexOf("ignor") >= 0 ? "warning" : "error";

	// Dictionary error: "<dictLine> <col> [msg - file.dict]". The FIRST number is
	// the line in the .dict file (see #878), so it becomes lineNum.
	if (trimmed.endsWith(".dict]")) {
		const parts = trimmed.split(/[\t \]]/);
		const dictFile = parts[parts.length - 2];
		return { kind: "dict", passNum, lineNum: passNum, dictFile, message: trimmed, severity };
	}

	return { kind: "pass", passNum, lineNum, message: trimmed, severity };
}

export function parseEngineErrors(text: string): EngineError[] {
	const out: EngineError[] = [];
	for (const line of text.split(/\r?\n/)) {
		const e = parseEngineErrorLine(line);
		if (e) out.push(e);
	}
	return out;
}
