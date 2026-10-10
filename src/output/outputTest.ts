// Tests for analyzerOutputLines. Runs with plain Node via `npm run test:output`.

import { analyzerOutputLines } from "./analyzerOutput";

let passed = 0;
let failed = 0;

function check(name: string, got: string[], want: string[]): void {
	if (JSON.stringify(got) === JSON.stringify(want)) {
		passed++;
	} else {
		failed++;
		console.error(`  FAIL: ${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`);
	}
}

// Engine 4.2.4 and later: stdout is only what the analyzer printed.
check("new engine", analyzerOutputLines("21\r\n34\r\n"), ["21", "34"]);

// Before 4.2.4 the engine's status lines shared stdout with cout() output.
const oldEngine = [
	"[command arg: -ANA]",
	"[command arg: C:\\analyzers\\gcd]",
	"[logfile: C:\\engine\\vtrun_logfile.out]",
	"[rfbdir: C:\\engine\\data\\rfb\\spec]",
	"[analyzer directory: C:\\analyzers\\gcd]",
	"[analyzer name: gcd]",
	"[rfb file: C:\\engine\\data\\rfb\\spec]",
	"[log file: .\\tmp\\visualtext.log]",
	"[spec directory: C:\\analyzers\\gcd\\spec]",
	"[spec file: C:\\analyzers\\gcd\\spec\\analyzer.seq]",
	"[output directory: C:\\analyzers\\gcd\\output]",
	"[infile path: C:\\analyzers\\gcd\\input\\text.txt]",
	"[outfile path: C:\\analyzers\\gcd\\outfile.txt]",
	"[Creating output directory: C:\\analyzers\\gcd\\input\\text.txt_log]",
	"[outdir path: C:\\analyzers\\gcd\\input\\text.txt_log]",
	"21",
	"34",
	"[AFTER VTRUN DELETE: ]",
	"",
].join("\r\n");
check("old engine status lines removed", analyzerOutputLines(oldEngine), ["21", "34"]);

// The analyzer's own bracketed lines and blank lines inside its output stay.
check("analyzer brackets kept",
	analyzerOutputLines("[1] first\n\n[note: kept]\nlast\n\n"),
	["[1] first", "", "[note: kept]", "last"]);

// Nothing printed: nothing to show.
check("no output", analyzerOutputLines(oldEngine.replace("21\r\n34\r\n", "")), []);
check("empty", analyzerOutputLines(""), []);

console.log(`analyzer output: ${passed} passed, ${failed} failed`);
if (failed)
	process.exit(1);
