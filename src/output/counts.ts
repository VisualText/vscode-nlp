// Frequency counts for corpus study (#613). PURE: no 'vscode' import.

export interface Count {
	key: string;
	count: number;
}

// Highest count first; ties alphabetically, ignoring case.
function sorted(map: Map<string, number>): Count[] {
	return [...map].map(([key, count]) => ({ key, count }))
		.sort((a, b) => b.count - a.count || a.key.toLowerCase().localeCompare(b.key.toLowerCase()) || a.key.localeCompare(b.key));
}

// Each distinct line and how many times it occurs. Blank lines are skipped;
// lines are compared exactly, after trimming trailing whitespace.
export function countLines(lines: string[]): Count[] {
	const map = new Map<string, number>();
	for (const raw of lines) {
		const line = raw.replace(/\s+$/, "");
		if (!line.length) continue;
		map.set(line, (map.get(line) ?? 0) + 1);
	}
	return sorted(map);
}

// Each distinct word and how many times it occurs, lowercased. A word is a run
// of letters and digits, with inner apostrophes and hyphens kept ("don't",
// "x-ray"); everything else separates words.
export function countWords(texts: string[]): Count[] {
	const map = new Map<string, number>();
	const word = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
	for (const text of texts) {
		for (const m of text.matchAll(word)) {
			const w = m[0].toLowerCase();
			map.set(w, (map.get(w) ?? 0) + 1);
		}
	}
	return sorted(map);
}

// "count<TAB>key" lines, ready to open in an editor.
export function formatCounts(counts: Count[]): string {
	return counts.map((c) => `${c.count}\t${c.key}`).join("\n") + (counts.length ? "\n" : "");
}
