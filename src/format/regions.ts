// Region splitter for NLP++ pass files.
//
// A .nlp file is a sequence of regions introduced by "@" directives. This layer
// partitions the source into Region objects such that regions.map(r => r.text)
// .join('') === src (a lossless partition — verified over the corpus). Splitting
// is done on the token stream, so a "@POST" that appears inside a string or a
// block comment is NOT treated as a region marker.

import { Token, TokenKind, Region, RegionKind } from "./types";
import { tokenize } from "./tokenizer";

// Which RegionKind a directive keyword maps to.
function regionKindFor(marker: string): RegionKind {
	const kw = marker.replace(/^@+/, "").toUpperCase();
	switch (kw) {
		case "DECL":
		case "CODE":
		case "PRE":
		case "POST":
		case "CHECK":
			return RegionKind.Code;
		case "RULES":
		case "MULTI":
		case "SELECT":
		case "RECURSE":
			return RegionKind.Rules;
		default:
			return RegionKind.Other;
	}
}

// A directive only starts a new region when it is the first non-whitespace
// token on its line. This mirrors how pass files are actually written (markers
// live at column 0) and avoids splitting on an "@RULES" mentioned mid-line.
function directiveAtLineStart(tokens: Token[], idx: number): boolean {
	for (let k = idx - 1; k >= 0; k--) {
		const t = tokens[k];
		if (t.kind === TokenKind.Newline) return true;
		if (t.kind === TokenKind.Whitespace) continue;
		return false;
	}
	return true; // start of file
}

export function splitRegions(src: string): Region[] {
	const tokens = tokenize(src);
	const regions: Region[] = [];

	// Offsets where a new region begins (always includes 0).
	const starts: { offset: number; marker: string }[] = [{ offset: 0, marker: "" }];

	for (let idx = 0; idx < tokens.length; idx++) {
		const t = tokens[idx];
		if (t.kind === TokenKind.Directive && directiveAtLineStart(tokens, idx)) {
			starts.push({ offset: t.start, marker: t.text });
		}
	}

	for (let s = 0; s < starts.length; s++) {
		const startOff = starts[s].offset;
		const endOff = s + 1 < starts.length ? starts[s + 1].offset : src.length;
		if (endOff <= startOff && !(startOff === 0 && src.length === 0)) {
			// Two directives back-to-back with nothing between: skip the empty
			// slice but keep the marker for the following region.
			continue;
		}
		const marker = starts[s].marker;
		const kind = s === 0 ? RegionKind.Preamble : regionKindFor(marker);
		regions.push({
			kind,
			marker,
			text: src.slice(startOff, endOff),
			start: startOff,
			end: endOff,
		});
	}

	// If the file has no leading content before the first directive, the first
	// Preamble slice is empty ("" region). Drop a truly empty leading region so
	// callers don't see a phantom, but only when there is other content.
	if (regions.length > 1 && regions[0].kind === RegionKind.Preamble && regions[0].text.length === 0) {
		regions.shift();
	}

	return regions;
}
