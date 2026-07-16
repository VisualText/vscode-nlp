// Pure detection of misspelled function calls for NLP++ quick fixes.
//
// PURE MODULE: no 'vscode' import. Scans code regions for "word(" call sites
// where `word` is not a known function (built-in or user @DECL) and is a close
// spelling of a known one. High precision by design: a candidate is only
// reported when a suggestion within a small edit distance exists, so it never
// fires on ordinary variables or novel identifiers.

import { tokenize } from "../format/tokenizer";
import { TokenKind } from "../format/types";
import { splitRegions } from "../format/regions";
import { RegionKind } from "../format/types";

export interface UnknownCall {
	start: number;
	length: number;
	word: string;
	suggestion: string; // the closest known function
}

// Classic Levenshtein edit distance (small strings; iterative DP).
export function levenshtein(a: string, b: string): number {
	const m = a.length, n = b.length;
	if (!m) return n;
	if (!n) return m;
	let prev = new Array(n + 1);
	for (let j = 0; j <= n; j++) prev[j] = j;
	for (let i = 1; i <= m; i++) {
		const cur = [i];
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
		}
		prev = cur;
	}
	return prev[n];
}

// Closest known name within maxDist, or undefined. Length-prefiltered so we
// don't run DP against the whole ~250-name built-in list needlessly.
function closest(word: string, known: string[], maxDist: number): string | undefined {
	let best: string | undefined;
	let bestDist = maxDist + 1;
	for (const k of known) {
		if (Math.abs(k.length - word.length) > maxDist) continue;
		const d = levenshtein(word, k);
		if (d < bestDist) { bestDist = d; best = k; }
	}
	return bestDist <= maxDist ? best : undefined;
}

// Offsets (into src) of every region that holds imperative code.
function codeRegionSpans(src: string): Array<{ start: number; end: number }> {
	return splitRegions(src)
		.filter((r) => r.kind === RegionKind.Code)
		.map((r) => ({ start: r.start, end: r.end }));
}

// Find misspelled function calls. `known` is the full list of valid function
// names (built-ins + user functions); `isKnown` is a fast membership test.
export function findUnknownCalls(
	src: string,
	isKnown: (name: string) => boolean,
	known: string[],
	maxDist = 2,
): UnknownCall[] {
	const spans = codeRegionSpans(src);
	if (!spans.length) return [];
	const inCode = (off: number) => spans.some((s) => off >= s.start && off < s.end);

	const tokens = tokenize(src);
	const out: UnknownCall[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.kind !== TokenKind.Word) continue;
		if (!/^[A-Za-z_]\w*$/.test(t.text)) continue;
		if (!inCode(t.start)) continue;
		// Must be a call: next non-trivial token is "(".
		const next = tokens[i + 1];
		if (!next || next.kind !== TokenKind.Punct || next.text !== "(") continue;
		const word = t.text;
		if (isKnown(word) || word.length < 3) continue;
		const suggestion = closest(word, known, maxDist);
		if (suggestion && suggestion !== word) {
			out.push({ start: t.start, length: word.length, word, suggestion });
		}
	}
	return out;
}
