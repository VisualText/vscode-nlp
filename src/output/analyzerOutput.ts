// What an analyzer printed with cout(), separated from the engine's own lines.
//
// Kept free of the vscode module so plain Node can test it
// (tsconfig.output.json, npm run test:output).
//
// From engine 4.2.4 on, the engine's status lines go to stderr and stdout holds
// only the analyzer's cout() output. Older engines printed these status lines on
// stdout too, so they are dropped by name rather than by shape: an analyzer is
// free to print its own lines in [brackets].

const ENGINE_STATUS = new RegExp(
	'^\\[(?:' + [
		'command arg', 'logfile', 'rfbdir', 'analyzer directory', 'analyzer name',
		'rfb file', 'log file', 'spec directory', 'spec file', 'output directory',
		'Reusing loaded analyzer', 'infile path', 'outfile path', 'outdir path',
		'AFTER VTRUN DELETE', 'Creating output directory',
	].join('|') + '):'
);

/** The lines an analyzer wrote with cout(), without trailing blank lines. */
export function analyzerOutputLines(stdout: string): string[] {
	const lines = stdout.replace(/\r/g, '').split('\n').filter(line => !ENGINE_STATUS.test(line));
	while (lines.length && lines[lines.length - 1].trim() === '')
		lines.pop();
	while (lines.length && lines[0].trim() === '')
		lines.shift();
	return lines;
}

/**
 * The highest pass that left a parse tree (`anaNNN.tree`) among a log directory's
 * file names, or 0 if none did. After a failed run these are the passes that
 * completed before the error (#785).
 */
export function lastTreePass(fileNames: string[]): number {
	let last = 0;
	for (const name of fileNames) {
		const m = /^ana(\d+)\.tree$/i.exec(name);
		if (m) last = Math.max(last, Number(m[1]));
	}
	return last;
}
