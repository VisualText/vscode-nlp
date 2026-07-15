// Pure folding-range computation for NLP++ pass files.
//
// PURE MODULE: no 'vscode' import. Reuses the outline analyzer to produce
// foldable line ranges: one per region (@RULES/@CODE/@DECL/...) and one per rule
// inside an @RULES region. Functions are covered by their enclosing @DECL region
// fold (their symbol extent stops at the opening brace, so a per-function fold
// would be misleading). The VSCode adapter maps these to vscode.FoldingRange.

import { analyzeSymbols } from "./symbols";

export interface FoldRange {
	start: number; // 0-based start line (stays visible when folded)
	end: number;   // 0-based end line
}

function lineAt(text: string, offset: number): number {
	let line = 0;
	const stop = Math.min(offset, text.length);
	for (let i = 0; i < stop; i++) {
		if (text[i] === "\n") line++;
	}
	return line;
}

export function foldingRanges(src: string): FoldRange[] {
	const ranges: FoldRange[] = [];
	const add = (startOff: number, endOff: number) => {
		const s = lineAt(src, startOff);
		const e = lineAt(src, Math.max(startOff, endOff - 1));
		if (e > s) ranges.push({ start: s, end: e }); // only multi-line spans fold
	};

	for (const region of analyzeSymbols(src)) {
		add(region.start, region.end);
		for (const child of region.children) {
			if (child.kind === "rule") add(child.start, child.end);
		}
	}
	return ranges;
}
