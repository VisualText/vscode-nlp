// Pure "enclosing call" locator for NLP++ signature help.
//
// PURE MODULE: no 'vscode' import. Given an offset inside a function call's
// argument list, returns the callee name and which argument (0-based) the cursor
// is in. Works on the lossless token stream, so parens/commas inside strings and
// comments are ignored automatically (they are non-Punct token kinds).

import { tokenize } from "../format/tokenizer";
import { TokenKind } from "../format/types";

export interface CallContext {
	name: string;       // the function being called
	activeParam: number; // 0-based index of the argument the cursor is in
}

export function findEnclosingCall(text: string, offset: number): CallContext | undefined {
	const tokens = tokenize(text);

	// Index of the last token that starts at or before the cursor.
	let idx = -1;
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].start < offset) idx = i;
		else break;
	}
	if (idx < 0) return undefined;

	// Walk back to the '(' that opens the call enclosing the cursor.
	let depth = 0;
	let openParen = -1;
	for (let k = idx; k >= 0; k--) {
		const t = tokens[k];
		if (t.kind !== TokenKind.Punct) continue;
		if (t.text === ")" || t.text === "]" || t.text === "}") depth++;
		else if (t.text === "[" || t.text === "{") { if (depth > 0) depth--; }
		else if (t.text === "(") {
			if (depth === 0) { openParen = k; break; }
			depth--;
		}
	}
	if (openParen < 0) return undefined;

	// The callee is the nearest Word token before the '('.
	let name = "";
	for (let k = openParen - 1; k >= 0; k--) {
		const t = tokens[k];
		if (t.kind === TokenKind.Whitespace || t.kind === TokenKind.Newline) continue;
		if (t.kind === TokenKind.Word) name = t.text;
		break;
	}
	if (!name) return undefined;

	// Count top-level commas between '(' and the cursor for the active argument.
	let activeParam = 0;
	let d = 0;
	for (let k = openParen + 1; k <= idx; k++) {
		const t = tokens[k];
		if (t.start >= offset) break;
		if (t.kind !== TokenKind.Punct) continue;
		if (t.text === "(" || t.text === "[" || t.text === "{") d++;
		else if (t.text === ")" || t.text === "]" || t.text === "}") d--;
		else if (t.text === "," && d === 0) activeParam++;
	}

	return { name, activeParam };
}
