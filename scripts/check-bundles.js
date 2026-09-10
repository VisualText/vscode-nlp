// Fail the package step if a webpack bundle is missing from the .vsix.
//
// WHY THIS EXISTS. Every webpack entry point is a separate PROCESS -- the
// extension host, the language server, the debug adapter. Nothing imports the
// server or the adapter, so nothing warns when they are absent: the extension
// packages cleanly, installs cleanly, activates cleanly, and then has no
// language features and no debugger, with no error anywhere pointing at the
// cause.
//
// That is not hypothetical. `.vscodeignore` excludes dist/** and re-includes
// files one by one; it was written when extension.js was the only bundle, so
// 3.13.0 through 3.14.2 shipped without dist/server.js or dist/debugAdapter.js.
// The marketplace build was broken for two releases before anyone could tell.
//
// So: read the entry points out of webpack.config.js, and require each one's
// output to be inside the packaged .vsix. Adding an entry point without a
// matching "!dist/..." line in .vscodeignore now fails the build.

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const root = path.resolve(__dirname, "..");

function expectedBundles() {
	// The config is an array of webpack configs, one per process.
	const configs = require(path.join(root, "webpack.config.js"));
	const list = Array.isArray(configs) ? configs : [configs];
	return list.map((c) => c.output && c.output.filename).filter(Boolean);
}

function findVsix() {
	const named = process.argv[2];
	if (named) return path.resolve(root, named);
	const candidates = fs.readdirSync(root).filter((f) => f.endsWith(".vsix"));
	if (!candidates.length) {
		console.error("check-bundles: no .vsix found in the repo root.");
		process.exit(1);
	}
	// Newest, so a stale one from an earlier build is not what gets checked.
	candidates.sort((a, b) =>
		fs.statSync(path.join(root, b)).mtimeMs - fs.statSync(path.join(root, a)).mtimeMs);
	return path.join(root, candidates[0]);
}

// A .vsix is a zip. Read its central directory directly rather than shelling
// out: Windows' Git Bash provides GNU tar, which cannot read zips at all, and
// `unzip` is not guaranteed anywhere. This needs no dependency and no external
// tool, so it behaves the same on a laptop and on a CI runner.
function vsixEntries(vsix) {
	const buf = fs.readFileSync(vsix);

	// End of Central Directory: signature 0x06054b50, within the last 64KB.
	const EOCD_SIG = 0x06054b50;
	let eocd = -1;
	for (let i = buf.length - 22; i >= 0 && i >= buf.length - 65557; i--) {
		if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
	}
	if (eocd < 0) throw new Error("not a zip archive (no end-of-central-directory record)");

	const count = buf.readUInt16LE(eocd + 10);
	let offset = buf.readUInt32LE(eocd + 16);

	const names = [];
	const CEN_SIG = 0x02014b50;
	for (let i = 0; i < count; i++) {
		if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CEN_SIG) {
			throw new Error(`central directory entry ${i + 1} of ${count} is malformed`);
		}
		const nameLen = buf.readUInt16LE(offset + 28);
		const extraLen = buf.readUInt16LE(offset + 30);
		const commentLen = buf.readUInt16LE(offset + 32);
		names.push(buf.toString("utf8", offset + 46, offset + 46 + nameLen));
		offset += 46 + nameLen + extraLen + commentLen;
	}
	return names;
}

function main() {
	const vsix = findVsix();
	const bundles = expectedBundles();
	if (!bundles.length) {
		console.error("check-bundles: webpack.config.js declared no output filenames.");
		process.exit(1);
	}

	let entries;
	try {
		entries = vsixEntries(vsix);
	} catch (err) {
		console.error(`check-bundles: could not read ${path.basename(vsix)} — ${err.message}`);
		process.exit(1);
	}

	const missing = bundles.filter(
		(b) => !entries.some((e) => e === `extension/dist/${b}` || e.endsWith(`/dist/${b}`)));

	if (missing.length) {
		console.error(
			`\ncheck-bundles: ${path.basename(vsix)} is missing ${missing.length} of ` +
			`${bundles.length} webpack bundles:\n`);
		for (const m of missing) console.error(`  dist/${m}`);
		console.error(
			`\nEach one is a separate process, so nothing will report this at runtime —\n` +
			`the extension just loses whatever that bundle provides. Add a matching\n` +
			`"!dist/<name>" line (and "!dist/<name>.map") to .vscodeignore.\n`);
		process.exit(1);
	}

	console.log(
		`check-bundles: all ${bundles.length} webpack bundles are in ` +
		`${path.basename(vsix)} (${bundles.join(", ")}).`);
}

main();
