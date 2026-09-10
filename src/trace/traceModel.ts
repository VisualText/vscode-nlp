// Loads a completed analyzer run into a steppable trace.
//
// PURE MODULE: no 'vscode' import. Given an analyzer directory and the input text
// that was run through it, this finds the per-pass ana###.tree dumps the engine
// wrote and turns them into an ordered timeline the debug adapter replays.
//
// Where the data comes from: an analyzer run writes <analyzer>/input/<...>/
// <text>_log/ana001.tree ... ana0NN.tree, one snapshot per pass. Each tree line
// records which pass and which rule line built that node (see treeParse.ts), so
// the snapshots together are an execution trace -- enough to step forward and
// backward through the run and ask, at any point, what the tree looked like and
// which rule produced a given node.
//
// Pass numbering comes from the "PASS n (name)" header inside each dump, not from
// the .seq file. The dumps are what actually ran; .seq is only consulted to name
// passes that produced no output, so a breakpoint in a pass that never executed
// can still be reported honestly as unverified rather than silently dropped.

import * as fs from "fs";
import * as path from "path";
import { parseTreeFile, PassTree, TraceNode, walkTree } from "./treeParse";

export interface TracePass {
	passNum: number;
	passName: string;
	treeFile: string;          // absolute path to the ana###.tree dump
	sourceFile: string | undefined; // absolute path to the .nlp pass file, if found
	root: TraceNode | undefined;
	nodeCount: number;
	firedCount: number;        // nodes this pass matched
	builtCount: number;        // nodes this pass created
}

export interface Trace {
	logDir: string;            // the <text>_log directory the dumps came from
	analyzerDir: string;       // the analyzer root (holds spec/ and input/)
	inputFile: string | undefined; // the analyzed text file, if it could be located
	inputText: string;         // its content, for showing the span a node covers
	passes: TracePass[];       // in execution order
}

const TREE_FILE = /^ana(\d+)\.tree$/i;

// A pass in the .seq that produced no dump. Kept so breakpoints in it resolve to
// a real pass name instead of vanishing.
export interface SeqEntry {
	typeStr: string;
	name: string;
}

// Parse an analyzer.seq into its rows. Format is "<type>\t<name>\t# comment";
// blank lines and comment-only lines are skipped.
export function parseSequence(text: string): SeqEntry[] {
	const out: SeqEntry[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.replace(/\s*#.*$/, "").trim();
		if (!line.length) continue;
		const parts = line.split(/\s+/);
		if (parts.length < 2) continue;
		out.push({ typeStr: parts[0], name: parts[1] });
	}
	return out;
}

// Rows that occupy a line in the .seq but never run as a pass, so they take no
// pass number. Mirrors the numbering in SequenceFile.renumberPasses().
const NON_PASS_TYPES = new Set(["folder", "stub", "end"]);

// Map pass number -> pass name using the .seq alone. Only a fallback: the tree
// headers are authoritative whenever a dump exists.
export function sequencePassNames(entries: SeqEntry[]): Map<number, string> {
	const out = new Map<number, string>();
	let passNum = 1;
	for (const entry of entries) {
		if (NON_PASS_TYPES.has(entry.typeStr.toLowerCase())) continue;
		out.set(passNum++, entry.name);
	}
	return out;
}

// Resolve a pass name to its source file. Passes live in <analyzer>/spec as .nlp
// (or .pat, for older analyzers); the tokenizer and other built-in pass types
// have no source file at all, which is why this may return undefined.
function findPassSource(analyzerDir: string, passName: string): string | undefined {
	for (const ext of [".nlp", ".pat"]) {
		const candidate = path.join(analyzerDir, "spec", passName + ext);
		if (fs.existsSync(candidate)) return candidate;
	}
	return undefined;
}

// Walk up from a <text>_log directory to the analyzer root. Layout is
// <analyzer>/input/<...>/<text>_log, so the root is the parent of "input".
function analyzerRootFrom(logDir: string): string {
	let dir = path.dirname(logDir);
	for (let i = 0; i < 12; i++) {
		if (path.basename(dir).toLowerCase() === "input") return path.dirname(dir);
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	// No input/ ancestor (an unusual layout): fall back to the log dir's parent.
	return path.dirname(logDir);
}

// The analyzed text for a <text>_log directory is the sibling file named by
// stripping the _log suffix.
function inputFileFor(logDir: string): string | undefined {
	const base = path.basename(logDir);
	const m = /^(.*)_log$/.exec(base);
	if (!m) return undefined;
	const candidate = path.join(path.dirname(logDir), m[1]);
	return fs.existsSync(candidate) ? candidate : undefined;
}

function summarise(tree: PassTree): { fired: number; built: number } {
	let fired = 0;
	let built = 0;
	if (tree.root) {
		walkTree(tree.root, (n) => {
			if (n.fired) fired++;
			if (n.built) built++;
		});
	}
	return { fired, built };
}

// Load every ana###.tree in `logDir` into an ordered trace.
export function loadTrace(logDir: string): Trace {
	const analyzerDir = analyzerRootFrom(logDir);
	const inputFile = inputFileFor(logDir);
	let inputText = "";
	if (inputFile) {
		try {
			inputText = fs.readFileSync(inputFile, "utf8");
		} catch {
			// The tree spans still make sense without it; only the text preview
			// in the variables view degrades.
		}
	}

	let entries: string[] = [];
	try {
		entries = fs.readdirSync(logDir);
	} catch {
		return { logDir, analyzerDir, inputFile, inputText, passes: [] };
	}

	// Fallback names for passes whose dump is missing or headerless.
	let seqNames = new Map<number, string>();
	try {
		const seqPath = path.join(analyzerDir, "spec", "analyzer.seq");
		seqNames = sequencePassNames(parseSequence(fs.readFileSync(seqPath, "utf8")));
	} catch {
		// No .seq -- header names still cover every pass that ran.
	}

	const passes: TracePass[] = [];
	for (const entry of entries) {
		const m = TREE_FILE.exec(entry);
		if (!m) continue;
		const treeFile = path.join(logDir, entry);
		let parsed: PassTree;
		try {
			parsed = parseTreeFile(fs.readFileSync(treeFile, "utf8"));
		} catch {
			continue; // unreadable dump -- skip the pass rather than fail the run
		}
		// The filename number is the reliable ordering key; the header supplies
		// the name. They agree in practice, but a truncated dump can lose the
		// header, and then the filename is all there is.
		const passNum = parsed.passNum || parseInt(m[1], 10);
		const passName = parsed.passName || seqNames.get(passNum) || `pass ${passNum}`;
		const { fired, built } = summarise(parsed);
		passes.push({
			passNum,
			passName,
			treeFile,
			sourceFile: findPassSource(analyzerDir, passName),
			root: parsed.root,
			nodeCount: parsed.nodeCount,
			firedCount: fired,
			builtCount: built,
		});
	}

	passes.sort((a, b) => a.passNum - b.passNum);
	return { logDir, analyzerDir, inputFile, inputText, passes };
}

// Find the newest <text>_log directory under an analyzer's input/ tree. Used when
// a launch config names an analyzer but not a specific run.
export function findLatestLogDir(analyzerDir: string): string | undefined {
	const inputDir = path.join(analyzerDir, "input");
	let best: { dir: string; mtime: number } | undefined;

	const scan = (dir: string, depth: number): void => {
		if (depth > 6) return;
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const full = path.join(dir, entry.name);
			if (entry.name.endsWith("_log")) {
				try {
					const mtime = fs.statSync(full).mtimeMs;
					if (!best || mtime > best.mtime) best = { dir: full, mtime };
				} catch { /* skip */ }
			} else {
				scan(full, depth + 1);
			}
		}
	};

	scan(inputDir, 0);
	return best?.dir;
}

// Every pass that touched a given source file. A pass file can appear once in the
// sequence, but this is a list because nothing stops an analyzer from running the
// same pass twice.
export function passesForSource(trace: Trace, sourceFile: string): TracePass[] {
	const target = path.resolve(sourceFile).toLowerCase();
	return trace.passes.filter((p) => p.sourceFile && path.resolve(p.sourceFile).toLowerCase() === target);
}

// Nodes in `pass` that the pass itself built -- the "what did this step do?"
// answer the debugger shows on arrival at a pass.
export function nodesBuiltBy(pass: TracePass): TraceNode[] {
	const out: TraceNode[] = [];
	if (!pass.root) return out;
	walkTree(pass.root, (n) => {
		if (n.passNum === pass.passNum && (n.built || n.fired)) out.push(n);
	});
	return out;
}

// The rule lines in `pass` that actually fired, in source order. This is what
// turns a rule-line breakpoint into a hit test.
export function firedRuleLines(pass: TracePass): Set<number> {
	const lines = new Set<number>();
	if (!pass.root) return lines;
	walkTree(pass.root, (n) => {
		if (n.passNum === pass.passNum && n.ruleLine > 0 && (n.fired || n.built)) {
			lines.add(n.ruleLine);
		}
	});
	return lines;
}
