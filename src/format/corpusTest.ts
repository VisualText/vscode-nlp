// Corpus test harness for the NLP++ formatter foundation.
//
// Runs the core invariants over a large tree of real .nlp files with plain Node
// (no VSCode/Electron). Usage after `npm run compile`:
//
//   node dist/format/corpusTest.js [dir ...]
//
// Defaults to scanning c:\git if no dirs are given. Checks, per file:
//   1. tokenizer round-trip : detokenize(tokenize(src)) === src   (lossless)
//   2. region round-trip    : regions.join('') === src            (lossless partition)
// Once printers exist this harness also gains an idempotency check.

import * as fs from "fs";
import * as path from "path";
import { tokenize, detokenize } from "./tokenizer";
import { splitRegions } from "./regions";
import { formatDocument, formatRegionsInRange } from "./formatter";

interface Failure {
	file: string;
	check: string;
	detail: string;
}

function walk(dir: string, out: string[]): void {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const e of entries) {
		if (e.name === "node_modules" || e.name === ".git") continue;
		const full = path.join(dir, e.name);
		if (e.isDirectory()) walk(full, out);
		else if (e.isFile() && (e.name.endsWith(".nlp") || e.name.endsWith(".pat"))) out.push(full);
	}
}

// Locate the first offset where two strings diverge, with a little context.
function firstDiff(a: string, b: string): string {
	const len = Math.min(a.length, b.length);
	let i = 0;
	while (i < len && a[i] === b[i]) i++;
	const ctx = (s: string) => JSON.stringify(s.slice(Math.max(0, i - 20), i + 20));
	return `at offset ${i} (len ${a.length} vs ${b.length}); got ${ctx(a)} vs src ${ctx(b)}`;
}

function main(): void {
	const dirs = process.argv.slice(2);
	if (dirs.length === 0) dirs.push("c:\\git");

	const files: string[] = [];
	for (const d of dirs) walk(d, files);

	const failures: Failure[] = [];
	let ok = 0;
	let changed = 0; // files whose formatting differs from the original

	for (const file of files) {
		let src: string;
		try {
			src = fs.readFileSync(file, "utf8");
		} catch (err) {
			failures.push({ file, check: "read", detail: String(err) });
			continue;
		}

		let fileOk = true;

		// 1. Tokenizer round-trip.
		try {
			const round = detokenize(tokenize(src));
			if (round !== src) {
				failures.push({ file, check: "tokenize", detail: firstDiff(round, src) });
				fileOk = false;
			}
		} catch (err) {
			failures.push({ file, check: "tokenize-throw", detail: String(err) });
			fileOk = false;
		}

		// 2. Region round-trip.
		try {
			const round = splitRegions(src).map((r) => r.text).join("");
			if (round !== src) {
				failures.push({ file, check: "regions", detail: firstDiff(round, src) });
				fileOk = false;
			}
		} catch (err) {
			failures.push({ file, check: "regions-throw", detail: String(err) });
			fileOk = false;
		}

		// 3. Idempotency: formatting already-formatted output is a no-op.
		try {
			const once = formatDocument(src);
			const twice = formatDocument(once);
			if (once !== src) changed++;
			if (once !== twice) {
				failures.push({ file, check: "idempotency", detail: firstDiff(twice, once) });
				fileOk = false;
			}
		} catch (err) {
			failures.push({ file, check: "format-throw", detail: String(err) });
			fileOk = false;
		}

		// 4. Range formatting over the whole document must equal a full format.
		// The range path formats per-region and returns replace edits; applying
		// them across [0, len) should reconstruct formatDocument(src) exactly.
		try {
			const edits = formatRegionsInRange(src, 0, src.length)
				.sort((a, b) => b.start - a.start); // apply right-to-left to keep offsets valid
			let ranged = src;
			for (const e of edits) ranged = ranged.slice(0, e.start) + e.newText + ranged.slice(e.end);
			if (ranged !== formatDocument(src)) {
				failures.push({ file, check: "range-vs-full", detail: firstDiff(ranged, formatDocument(src)) });
				fileOk = false;
			}
		} catch (err) {
			failures.push({ file, check: "range-throw", detail: String(err) });
			fileOk = false;
		}

		if (fileOk) ok++;
	}

	console.log(`\nScanned ${files.length} files across: ${dirs.join(", ")}`);
	console.log(`  passed: ${ok}`);
	console.log(`  failed: ${files.length - ok}`);
	console.log(`  reformatted (differ from original): ${changed}`);

	if (failures.length) {
		const byCheck: Record<string, number> = {};
		for (const f of failures) byCheck[f.check] = (byCheck[f.check] || 0) + 1;
		console.log(`\nFailures by check:`);
		for (const [k, v] of Object.entries(byCheck)) console.log(`  ${k}: ${v}`);

		console.log(`\nFirst ${Math.min(20, failures.length)} failures:`);
		for (const f of failures.slice(0, 20)) {
			console.log(`  [${f.check}] ${f.file}`);
			console.log(`      ${f.detail}`);
		}
	} else {
		console.log(`\nAll invariants hold. Foundation is lossless across the corpus.`);
	}

	// Use exitCode (not process.exit) so buffered stdout is fully flushed when
	// output is redirected to a file or pipe.
	process.exitCode = failures.length ? 1 : 0;
}

main();
