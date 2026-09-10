// Offset <-> LSP Position conversion over a line table built once per file.
//
// PURE MODULE: no 'vscode' import, and no 'vscode-languageserver' runtime import
// either -- Position is a plain {line, character} object, so this stays testable
// with bare Node.
//
// Building the table is a single pass; each lookup is a binary search. That
// matters: indexing a file costs two conversions per symbol, and the English
// lexicon en-full.kbb parses to 375,449 concepts. The naive "count newlines from
// offset 0" version made indexing that one file quadratic -- roughly two and a
// half hours of blocked event loop. See the history note in the VSCode-side
// index this replaces.

export interface Position {
	line: number;
	character: number;
}

export interface Range {
	start: Position;
	end: Position;
}

export class LineIndex {
	// starts[i] = offset of the first character of line i.
	private readonly starts: number[] = [0];

	constructor(text: string) {
		for (let i = 0; i < text.length; i++) {
			if (text[i] === "\n") this.starts.push(i + 1);
		}
	}

	position(offset: number): Position {
		// Last line whose start is <= offset. An offset past the end of the text
		// lands on the final line, matching the old scan-and-clamp behaviour.
		let lo = 0;
		let hi = this.starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (this.starts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return { line: lo, character: offset - this.starts[lo] };
	}

	range(start: number, end: number): Range {
		return { start: this.position(start), end: this.position(end) };
	}

	// Offset of the first character of `line`, clamped to the document.
	offsetAt(pos: Position): number {
		const line = Math.max(0, Math.min(pos.line, this.starts.length - 1));
		return this.starts[line] + Math.max(0, pos.character);
	}
}
