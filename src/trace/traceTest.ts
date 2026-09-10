// Pure-logic test harness for the NLP++ trace model.
//
// Runs with plain Node (no Electron/VSCode) over the .tree parser and the trace
// loader, mirroring src/language/langTest.ts. Compiled via tsconfig.trace.json
// and run by `npm run test:trace`. Exits non-zero on any failed assertion.
//
// The fixtures below are real engine output shapes, taken from Pn::print in
// lite/pn.cpp. Getting the flag vocabulary right matters more than it looks:
// flags are emitted only when set, so they are named rather than positional, and
// a positional reader silently mistakes an unsealed node for a fired one.

import * as fs from "fs";
import * as path from "path";
import { parseTreeLine, parseTreeFile, nodeAtOffset, walkTree, parseNodeFlags } from "./treeParse";
import {
	loadTrace, findLatestLogDir, parseSequence, sequencePassNames,
	passesForSource, firedRuleLines, nodesBuiltBy,
} from "./traceModel";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string): void {
	if (cond) {
		passed++;
	} else {
		failed++;
		console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
	}
}
function eq<T>(name: string, actual: T, expected: T): void {
	check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ---- line parsing ----------------------------------------------------------
{
	const plain = parseTreeLine("_ROOT [0,1429,0,1429,0,0,node,un]");
	check("line: root parses", plain !== undefined);
	eq("line: root name", plain?.name, "_ROOT");
	eq("line: root start", plain?.start, 0);
	eq("line: root end", plain?.end, 1429);
	eq("line: root type", plain?.type, "node");
	eq("line: root depth", plain?.depth, 0);
	// The critical one: "un" is the unsealed flag, NOT fired. A positional reader
	// takes field 7 as "fired" and gets this backwards on every unsealed node.
	eq("line: un sets unsealed", plain?.unsealed, true);
	eq("line: un does NOT set fired", plain?.fired, false);
	eq("line: un does NOT set built", plain?.built, false);

	const fired = parseTreeLine('   _rank [24,28,24,28,4,117,node,fired,blt, ("number" "1")]');
	eq("line: fired flag", fired?.fired, true);
	eq("line: blt flag", fired?.built, true);
	eq("line: passNum", fired?.passNum, 4);
	eq("line: ruleLine", fired?.ruleLine, 117);
	eq("line: depth from indent", fired?.depth, 1);
	eq("line: one attribute", fired?.attributes.length, 1);
	eq("line: attribute name", fired?.attributes[0].name, "number");
	eq("line: attribute value", fired?.attributes[0].value, '"1"');

	const multi = parseTreeLine(
		'      _sentence [0,183,0,183,5,24,node,un, ("name" "sentence1") ("object" concept:"sentence1")]');
	eq("line: two attributes", multi?.attributes.length, 2);
	eq("line: second attribute name", multi?.attributes[1].name, "object");
	eq("line: second attribute value", multi?.attributes[1].value, 'concept:"sentence1"');
	eq("line: depth 2", multi?.depth, 2);

	// A literal "[" token in the input is its own node, and its name is "[".
	const bracket = parseTreeLine("   [ [12,12,12,12,0,0,punct]");
	eq("line: bracket node name", bracket?.name, "[");
	eq("line: bracket node type", bracket?.type, "punct");

	// UNICODE builds append " r_to_l" to the name; it is not part of the name.
	const rtl = parseTreeLine("_ROOT r_to_l [0,10,0,10,0,0,node]");
	eq("line: r_to_l stripped", rtl?.name, "_ROOT");

	const base = parseTreeLine("_x [0,1,0,1,2,3,node,b,sem]");
	eq("line: b sets base", base?.base, true);
	eq("line: sem flag", base?.sem, true);
	eq("line: b does not set fired", base?.fired, false);

	check("line: header is not a node", parseTreeLine("    PASS 15 (moneyAttributes)") === undefined);
	check("line: blank is not a node", parseTreeLine("") === undefined);
	check("line: banner is not a node", parseTreeLine("PAT OUTPUT TREE:") === undefined);
}

// ---- flag vocabulary -------------------------------------------------------
// parseNodeFlags is shared with the older reader in treeFile.ts. These cases are
// the ones a positional reader gets wrong, and they are not hypothetical: the
// sample analyzers contain 63 nodes written with a flag before "fired".
{
	const none = parseNodeFlags([]);
	eq("flags: nothing set by default", [none.base, none.unsealed, none.sem, none.fired, none.built].join(","), "false,false,false,false,false");

	// "node,un" -- field 7 is "un". Read positionally this reports fired.
	const un = parseNodeFlags(["un"]);
	eq("flags: un is unsealed", un.unsealed, true);
	eq("flags: un is not fired", un.fired, false);

	// "node,fired,blt" -- the shape a positional reader was tuned for.
	const plain = parseNodeFlags(["fired", "blt"]);
	eq("flags: fired,blt fired", plain.fired, true);
	eq("flags: fired,blt built", plain.built, true);

	// "node,un,fired,blt" -- blt has shifted one field along. This is the case
	// that dropped built nodes from the tree in "Display Built Only" mode.
	const shifted = parseNodeFlags(["un", "fired", "blt"]);
	eq("flags: un,fired,blt still built", shifted.built, true);
	eq("flags: un,fired,blt still fired", shifted.fired, true);
	eq("flags: un,fired,blt unsealed", shifted.unsealed, true);

	// "node,b,fired,blt" -- the other real shifted shape in the corpus.
	const based = parseNodeFlags(["b", "fired", "blt"]);
	eq("flags: b,fired,blt built", based.built, true);
	eq("flags: b,fired,blt base", based.base, true);

	// Every flag at once, shifting blt as far as it goes.
	const all = parseNodeFlags(["b", "un", "sem", "fired", "blt"]);
	eq("flags: all five set", [all.base, all.unsealed, all.sem, all.fired, all.built].join(","), "true,true,true,true,true");

	// The attribute chunk trails the flags in the same field list and must not
	// be mistaken for one.
	const withAttrs = parseNodeFlags(["un", ' ("name" "sentence1")']);
	eq("flags: attribute chunk is not a flag", withAttrs.fired, false);
	eq("flags: attribute chunk leaves un set", withAttrs.unsealed, true);

	// Whitespace around a flag (the field list is split on commas, not trimmed).
	eq("flags: padded flag still reads", parseNodeFlags([" blt "]).built, true);
}

// ---- file parsing ----------------------------------------------------------
{
	const dump = [
		"",
		"***************",
		"    PASS 15 (moneyAttributes)",
		"***************",
		"",
		"PAT OUTPUT TREE:",
		"",
		"_ROOT [0,20,0,20,0,0,node,un]",
		"   _money [0,10,0,10,15,17,node,fired,blt]",
		"      $ [0,0,0,0,0,0,punct]",
		"      130 [1,3,1,3,0,0,num]",
		"   _det [12,14,12,14,12,35,node]",
		"",
	].join("\n");

	const tree = parseTreeFile(dump);
	eq("file: pass number from header", tree.passNum, 15);
	eq("file: pass name from header", tree.passName, "moneyAttributes");
	eq("file: node count", tree.nodeCount, 5);
	eq("file: root name", tree.root?.name, "_ROOT");
	eq("file: root has two children", tree.root?.children.length, 2);
	eq("file: first child is _money", tree.root?.children[0].name, "_money");
	eq("file: _money has two children", tree.root?.children[0].children.length, 2);
	eq("file: grandchild name", tree.root?.children[0].children[1].name, "130");
	eq("file: second child is _det", tree.root?.children[1].name, "_det");

	// Depth-first order is document order.
	const names: string[] = [];
	if (tree.root) walkTree(tree.root, (n) => names.push(n.name));
	eq("file: walk order", names.join(","), "_ROOT,_money,$,130,_det");

	// nodeAtOffset returns the DEEPEST containing node, not the root.
	eq("file: nodeAtOffset deepest", nodeAtOffset(tree.root!, 2)?.name, "130");
	eq("file: nodeAtOffset outside built spans", nodeAtOffset(tree.root!, 13)?.name, "_det");

	// A header-only dump (a KB-only pass such as initKB writes one) is valid and
	// must yield zero nodes rather than failing to parse.
	const empty = parseTreeFile("\n***************\n    PASS 3 (initKB)\n***************\n");
	eq("file: header-only pass number", empty.passNum, 3);
	eq("file: header-only node count", empty.nodeCount, 0);
	check("file: header-only has no root", empty.root === undefined);

	// A truncated dump must not throw and must still give back what it had.
	const truncated = parseTreeFile("    PASS 9 (company)\n_ROOT [0,5,0,5,0,0,node]\n         _deep [0,1,0,1,9,3,node]\n");
	eq("file: truncated still parses", truncated.nodeCount, 2);
	check("file: over-deep child still attaches", (truncated.root?.children.length ?? 0) > 0);
}

// ---- sequence parsing ------------------------------------------------------
{
	const seq = [
		"tokenize\tnil\t# Convert input to token list.",
		"nlp\tKBFuncs\t# Declare the KB functions",
		"stub\twords\t# Start of generated passes",
		"nlp\tcity\t# generated",
		"end\twords\t# End of generated passes",
		"nlp\tlookup\t# Look up phrases",
		"",
		"# a bare comment line",
	].join("\n");

	const entries = parseSequence(seq);
	eq("seq: row count skips blanks and comments", entries.length, 6);
	eq("seq: first type", entries[0].typeStr, "tokenize");
	eq("seq: second name", entries[1].name, "KBFuncs");

	// stub/end occupy a line but consume no pass number -- this is the numbering
	// that has to agree with the engine's own, or every breakpoint lands one pass
	// off in analyzers that use generated-pass folders.
	const names = sequencePassNames(entries);
	eq("seq: pass 1 is tokenize", names.get(1), "nil");
	eq("seq: pass 2 is KBFuncs", names.get(2), "KBFuncs");
	eq("seq: stub does not take a number", names.get(3), "city");
	eq("seq: end does not take a number", names.get(4), "lookup");
	eq("seq: no pass 5", names.get(5), undefined);
}

// ---- loading a real run ----------------------------------------------------
// Skipped rather than failed when the sample analyzer is not checked out, so the
// suite still runs in a bare clone.
{
	const ANALYZER = "C:/git/analyzers/corporate";
	const logDir = fs.existsSync(ANALYZER) ? findLatestLogDir(ANALYZER) : undefined;

	if (!logDir) {
		console.log("  (skipping real-run checks: no analyzer output found)");
	} else {
		const trace = loadTrace(logDir);
		check("run: passes loaded", trace.passes.length > 0, `got ${trace.passes.length}`);
		check("run: analyzer root resolved", path.basename(trace.analyzerDir) === "corporate", trace.analyzerDir);
		check("run: input text loaded", trace.inputText.length > 0);

		// Pass numbers must be unique and ascending -- the debugger indexes into
		// this array to step, so a duplicate or a gap would mis-order the replay.
		const nums = trace.passes.map((p) => p.passNum);
		const ascending = nums.every((n, i) => i === 0 || n > nums[i - 1]);
		check("run: pass numbers strictly ascending", ascending, nums.join(","));

		// Every pass that has rule output should resolve to a source file, except
		// built-in pass types (tokenize) which have none.
		const named = trace.passes.filter((p) => p.passName !== "tokenize" && p.builtCount > 0);
		const unresolved = named.filter((p) => !p.sourceFile);
		eq("run: rule passes resolve to a source file", unresolved.length, 0);

		// Fired rule lines must point at real lines of the pass file.
		for (const pass of trace.passes) {
			if (!pass.sourceFile) continue;
			const lineCount = fs.readFileSync(pass.sourceFile, "utf8").split(/\r?\n/).length;
			for (const line of firedRuleLines(pass)) {
				check(
					`run: ${pass.passName} fired line ${line} is within the file`,
					line >= 1 && line <= lineCount,
					`file has ${lineCount} lines`,
				);
			}
		}

		// A node's recorded pass must be one that actually ran at or before it.
		const last = trace.passes[trace.passes.length - 1];
		let badProvenance = 0;
		if (last.root) {
			walkTree(last.root, (n) => {
				if (n.passNum > last.passNum) badProvenance++;
			});
		}
		eq("run: no node claims a future pass", badProvenance, 0);

		// passesForSource round-trips.
		const withSource = trace.passes.find((p) => p.sourceFile);
		if (withSource?.sourceFile) {
			const found = passesForSource(trace, withSource.sourceFile);
			check("run: passesForSource finds the pass", found.some((p) => p.passNum === withSource.passNum));
			// And is case/separator insensitive, which matters on Windows where the
			// editor and the engine disagree about drive-letter case.
			const munged = withSource.sourceFile.replace(/\//g, "\\").toUpperCase();
			check("run: passesForSource is path-normalised", passesForSource(trace, munged).length > 0);
		}

		// nodesBuiltBy only returns nodes attributed to that pass.
		for (const pass of trace.passes) {
			const wrong = nodesBuiltBy(pass).filter((n) => n.passNum !== pass.passNum);
			if (wrong.length) {
				check(`run: ${pass.passName} builds only its own nodes`, false, `${wrong.length} foreign nodes`);
			}
		}
		check("run: nodesBuiltBy attribution", true);
	}
}

console.log(`\ntrace tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
