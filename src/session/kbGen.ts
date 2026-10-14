// KB generator passes (#272). PURE: no 'vscode' import.
//
// A KB generator is a pass the user marks in the sequence because it writes a
// knowledge base or dictionary -- SaveKB("mykb.kbb", ...), or a .dict written
// with <<. The engine puts such a file in the run's <text>_log folder, where the
// analyzer's own kb/user never sees it. With regeneration on, after a run in
// which a generator pass changed, the extension copies those files into kb/user
// and runs the text again, so the run uses the dictionary it just built.

// The .kbb and .dict files a pass writes: the names in its string literals.
// Only plain file names count (no folders), since that is what lands in the log
// folder; the pass's own text is the only reliable record of what it writes.
export function kbOutputsOf(passSource: string): string[] {
	const out: string[] = [];
	for (const m of passSource.matchAll(/"([^"\\/:*?<>|\r\n]+\.(?:kbb|dict))"/gi)) {
		if (!out.includes(m[1])) out.push(m[1]);
	}
	return out;
}

// Whether a generator pass has changed since its output was last copied in.
export function generatorChanged(modifiedMs: number, lastCopiedMs: number | undefined): boolean {
	return lastCopiedMs === undefined || modifiedMs > lastCopiedMs;
}
