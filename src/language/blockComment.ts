// Block-comment blanking for the line-oriented VisualText data formats.
//
// PURE MODULE: no 'vscode' import. NLP++ engine 3.7.14 added C-style /* */ block
// comments to .seq, .kb, .dict and .kbb alongside the pass language, and the engine
// handles them in cs/libconsh/blockcom.cpp by BLANKING them in place rather than
// deleting them -- the .dict and .kbb parsers index into a line by offset, so the
// offsets have to survive. This mirrors that: every character of a comment becomes a
// space, line structure and every other column stay exactly where they were, so a
// caller can tokenize the blanked line and still slice the original by the same index.
//
// C semantics, as the engine has them: comments do not nest (the first '*/' closes),
// '/*' inside a double-quoted string or after a '#' line comment is ordinary text, and
// an unterminated '/*' runs to end of input rather than being silently ignored.
//
// The pass language (.nlp/.pat) does NOT come through here -- it has a real tokenizer
// in ../format/tokenizer.ts.

interface Scan {
	blanked: string[];
	// True if any comment stayed open across a line break. The engine's lazy dictionary
	// load binary-searches *full.dict / *full.kbb and so cannot tell that an arbitrary
	// seek landed inside a comment: those files are single-line comments only, and the
	// engine's sorted-check rejects one holding a multi-line comment.
	multiLine: boolean;
}

function scan(lines: string[]): Scan {
	const blanked: string[] = [];
	let inComment = false;
	let multiLine = false;

	for (const line of lines) {
		const chars = line.split("");
		let inString = false;
		let i = 0;

		while (i < line.length) {
			if (inComment) {
				const close = line.indexOf("*/", i);
				const stop = close < 0 ? line.length : close + 2;
				for (let k = i; k < stop; k++) chars[k] = " ";
				i = stop;
				if (close >= 0) inComment = false;
				continue;
			}
			const c = line[i];
			if (inString) {
				if (c === "\\") i++;            // escaped char: skip the pair
				else if (c === '"') inString = false;
				i++;
				continue;
			}
			if (c === '"') { inString = true; i++; continue; }
			if (c === "#") break;               // line comment: rest of the line is text
			if (c === "/" && line[i + 1] === "*") {
				inComment = true;
				continue;                       // the in-comment branch does the blanking
			}
			i++;
		}
		// An unterminated string does not leak into the next line; an open comment does.
		if (inComment) multiLine = true;
		blanked.push(chars.join(""));
	}
	return { blanked, multiLine };
}

// Blank the block comments in one already-split array of lines. Line-oriented rather
// than whole-text because callers work from an existing line array and the two must
// stay index-aligned; comment state carries across lines.
export function blankBlockCommentLines(lines: string[]): string[] {
	return scan(lines).blanked;
}

// True if some block comment in these lines is not closed on the line that opened it.
export function hasMultiLineBlockComment(lines: string[]): boolean {
	return scan(lines).multiLine;
}

// Whole-text convenience wrapper. Preserves the line separators it was given.
export function blankBlockComments(text: string): string {
	const parts = text.split(/(\r?\n)/);            // capture keeps the separators
	const lines: string[] = [];
	for (let i = 0; i < parts.length; i += 2) lines.push(parts[i]);
	const blanked = blankBlockCommentLines(lines);
	let out = "";
	for (let i = 0; i < blanked.length; i++) {
		out += blanked[i];
		const sep = parts[i * 2 + 1];
		if (sep !== undefined) out += sep;
	}
	return out;
}

// True for a line that is nothing but block comment once blanked, while the original
// line held something. Callers use this to keep a comment line out of their entry/pass
// parsing without losing it from the file.
export function isCommentOnly(original: string, blanked: string): boolean {
	return blanked.trim().length === 0 && original.trim().length > 0;
}
