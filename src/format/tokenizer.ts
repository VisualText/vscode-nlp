// Lossless tokenizer for NLP++ (.nlp / .pat) source.
//
// Design contract: tokenize(src).map(t => t.text).join('') === src, for ANY
// input. The scanner always advances by at least one character and stores the
// exact source substring for every token, so no bytes are ever lost or altered.
// This invariant is what lets higher layers reformat whitespace with confidence
// that strings and comments can never be corrupted. It is checked over the whole
// corpus by corpusTest.ts.

import { Token, TokenKind, REGION_KEYWORDS } from "./types";

const REGION_SET = new Set<string>(REGION_KEYWORDS);

// Punctuation we want as its own single-char token so structural layers
// (brace/paren depth) can reason about it. Everything else clumps into Word.
const PUNCT = new Set<string>(["(", ")", "[", "]", "{", "}", ";", ","]);

function isSpaceNotNewline(c: string): boolean {
	return c === " " || c === "\t" || c === "\f" || c === "\v";
}

function isWordBreak(c: string): boolean {
	// Characters that terminate a Word run. Newlines, the spaces we treat as
	// whitespace, quotes, and structural punctuation all break a word.
	return (
		c === "\n" || c === "\r" || isSpaceNotNewline(c) ||
		c === '"' || PUNCT.has(c)
	);
}

export function tokenize(src: string): Token[] {
	const tokens: Token[] = [];
	const n = src.length;
	let i = 0;

	const push = (kind: TokenKind, start: number, end: number) => {
		tokens.push({ kind, text: src.slice(start, end), start, end });
	};

	while (i < n) {
		const c = src[i];
		const c2 = i + 1 < n ? src[i + 1] : "";

		// Newline: "\r\n", "\n", or lone "\r".
		if (c === "\n") {
			push(TokenKind.Newline, i, i + 1);
			i += 1;
			continue;
		}
		if (c === "\r") {
			const end = c2 === "\n" ? i + 2 : i + 1;
			push(TokenKind.Newline, i, end);
			i = end;
			continue;
		}

		// Horizontal whitespace run (no newlines).
		if (isSpaceNotNewline(c)) {
			let j = i + 1;
			while (j < n && isSpaceNotNewline(src[j])) j++;
			push(TokenKind.Whitespace, i, j);
			i = j;
			continue;
		}

		// Block comment /* ... */ (may be unterminated -> runs to EOF).
		if (c === "/" && c2 === "*") {
			let j = i + 2;
			while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j++;
			j = j < n ? j + 2 : n; // include closing */ if present
			push(TokenKind.BlockComment, i, j);
			i = j;
			continue;
		}

		// Line comment: '#' to end of line (newline NOT included).
		if (c === "#") {
			let j = i + 1;
			while (j < n && src[j] !== "\n" && src[j] !== "\r") j++;
			push(TokenKind.LineComment, i, j);
			i = j;
			continue;
		}

		// Double-quoted string. Honors backslash escapes. Terminates at the
		// closing quote OR at end-of-line if unterminated (matches the grammar).
		if (c === '"') {
			let j = i + 1;
			while (j < n) {
				const cj = src[j];
				if (cj === "\\") { j += 2; continue; } // skip escaped char
				if (cj === '"') { j += 1; break; }
				if (cj === "\n" || cj === "\r") break; // unterminated: stop before EOL
				j += 1;
			}
			if (j > n) j = n;
			push(TokenKind.String, i, j);
			i = j;
			continue;
		}

		// Rule terminator "@@" and region directives "@WORD" / "@@WORD".
		if (c === "@") {
			// Read the "@" or "@@" prefix.
			const atat = c2 === "@";
			let j = atat ? i + 2 : i + 1;
			const wordStart = j;
			while (j < n && /[A-Za-z_]/.test(src[j])) j++;
			const word = src.slice(wordStart, j);
			if (word.length && REGION_SET.has(word.toUpperCase())) {
				push(TokenKind.Directive, i, j);
				i = j;
				continue;
			}
			if (atat && word.length === 0) {
				push(TokenKind.AtAt, i, i + 2);
				i += 2;
				continue;
			}
			// A stray "@" (or "@word" that isn't a region marker): fall through
			// and treat it as the start of a Word so nothing is lost.
		}

		// Arrow "<-".
		if (c === "<" && c2 === "-") {
			push(TokenKind.Arrow, i, i + 2);
			i += 2;
			continue;
		}

		// Structural punctuation, one char each.
		if (PUNCT.has(c)) {
			push(TokenKind.Punct, i, i + 1);
			i += 1;
			continue;
		}

		// Word: maximal run up to the next break char. A backslash escapes the
		// following char (so "\ " or "\#" stay glued to the word).
		{
			let j = i;
			while (j < n) {
				const cj = src[j];
				if (cj === "\\" && j + 1 < n) { j += 2; continue; }
				if (isWordBreak(cj)) break;
				// stop if a region "@" or block comment starts mid-run
				if (cj === "@" || (cj === "/" && src[j + 1] === "*")) {
					if (j > i) break;
				}
				j += 1;
			}
			if (j === i) j = i + 1; // safety: always advance
			push(TokenKind.Word, i, j);
			i = j;
		}
	}

	return tokens;
}

// Convenience: reassemble source from tokens. Used by tests and by passthrough
// regions that don't need reformatting.
export function detokenize(tokens: Token[]): string {
	let s = "";
	for (const t of tokens) s += t.text;
	return s;
}
