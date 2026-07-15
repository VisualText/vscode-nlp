// Pure structural linter for NLP++ pass files.
//
// PURE MODULE: no 'vscode' import. Returns offset-based problems that the VSCode
// adapter maps to vscode.Diagnostic. These checks run on the lossless token
// stream, so brackets/comments inside strings or comments are never miscounted
// (the tokenizer already isolates String/LineComment/BlockComment tokens). The
// intent is near-zero false positives -- this is a static structural pass, NOT a
// substitute for the analyzer's own semantic errors.

import { tokenize } from "../format/tokenizer";
import { TokenKind } from "../format/types";

export type Severity = "error" | "warning";

export interface Problem {
	start: number;
	end: number;
	message: string;
	severity: Severity;
	code: string;
}

const OPEN_TO_CLOSE: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE_TO_OPEN: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

export function computeProblems(src: string): Problem[] {
	const problems: Problem[] = [];
	const tokens = tokenize(src);

	// 1) Unterminated block comment: a BlockComment token that never closed.
	for (const t of tokens) {
		if (t.kind === TokenKind.BlockComment && !t.text.endsWith("*/")) {
			problems.push({
				start: t.start,
				end: t.end,
				message: "Unterminated block comment ('/*' with no closing '*/').",
				severity: "error",
				code: "nlp.unterminated-comment",
			});
		}
	}

	// 2) Bracket balance over structural punctuation only. Strings/comments are
	// separate token kinds, so their brackets are correctly ignored.
	const stack: { ch: string; start: number }[] = [];
	for (const t of tokens) {
		if (t.kind !== TokenKind.Punct) continue;
		const ch = t.text;
		if (OPEN_TO_CLOSE[ch]) {
			stack.push({ ch, start: t.start });
		} else if (CLOSE_TO_OPEN[ch]) {
			const top = stack.pop();
			if (!top) {
				problems.push({
					start: t.start,
					end: t.end,
					message: `Unmatched '${ch}'.`,
					severity: "error",
					code: "nlp.unmatched-bracket",
				});
			} else if (OPEN_TO_CLOSE[top.ch] !== ch) {
				problems.push({
					start: t.start,
					end: t.end,
					message: `Mismatched '${ch}' -- expected '${OPEN_TO_CLOSE[top.ch]}' to close '${top.ch}'.`,
					severity: "error",
					code: "nlp.mismatched-bracket",
				});
			}
		}
	}
	for (const open of stack) {
		problems.push({
			start: open.start,
			end: open.start + 1,
			message: `Unclosed '${open.ch}' -- no matching '${OPEN_TO_CLOSE[open.ch]}'.`,
			severity: "error",
			code: "nlp.unclosed-bracket",
		});
	}

	return problems;
}
