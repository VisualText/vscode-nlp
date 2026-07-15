// Pure-logic test harness for the NLP++ language-intelligence engines.
//
// Runs with plain Node (no Electron/VSCode) over the vscode-free analysis
// modules, mirroring src/format/corpusTest.ts. Compiled via tsconfig.language.json
// and run by `npm run test:language`. Exits non-zero on any failed assertion so
// it can gate CI. Covers symbols, diagnostics, engine-error parsing, KB-concept
// extraction, completion region context, and the built-in data tables.

import { analyzeSymbols, declaredSymbols } from "./symbols";
import { computeProblems } from "./diagnostics";
import { parseEngineErrors } from "./engineErrors";
import { parseKbConcepts } from "./kbConcepts";
import { regionKindAt, RegionKind } from "./completion";
import { findEnclosingCall } from "./signature";
import { BUILTIN_SET, KEYWORD_SET, BUILTIN_FUNCTIONS } from "./nlpxxData";

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

const SAMPLE = `# header
@DECL
myHelper(L("x")) {
    if (num > 0) {
        return num;
    }
}
@@DECL

@RULES
_noun <- noun [s] @@
_verb <- verb @@

@CODE
   G("count") = 1;
   bad = ( 1 + 2 ;
@@CODE
`;

// ---- symbols ---------------------------------------------------------------
{
	const syms = analyzeSymbols(SAMPLE);
	const regions = syms.map((s) => s.name);
	check("symbols: @DECL region present", regions.includes("@DECL"));
	check("symbols: @RULES region present", regions.includes("@RULES"));
	check("symbols: @CODE region present", regions.includes("@CODE"));
	check("symbols: closing @@DECL not a region", !regions.includes("@@DECL"), regions.join(","));

	const rules = syms.find((s) => s.name === "@RULES");
	eq("symbols: @RULES has 2 rules", rules ? rules.children.length : -1, 2);
	check("symbols: rule _noun", !!rules && rules.children.some((c) => c.name === "_noun"));
	check("symbols: rule _verb", !!rules && rules.children.some((c) => c.name === "_verb"));

	const decl = syms.find((s) => s.name === "@DECL");
	check("symbols: myHelper function", !!decl && decl.children.some((c) => c.name === "myHelper"));
	const helper = decl?.children.find((c) => c.name === "myHelper");
	eq("symbols: myHelper signature captured", helper?.signature, 'L("x")');

	const names = declaredSymbols(SAMPLE).map((d) => d.name);
	check("declared: includes myHelper/_noun/_verb",
		["myHelper", "_noun", "_verb"].every((n) => names.includes(n)), names.join(","));
	check("declared: excludes keyword 'if'", !names.includes("if"), names.join(","));

	// selStart of a rule must land exactly on its name in the source.
	const noun = declaredSymbols(SAMPLE).find((d) => d.name === "_noun")!;
	eq("declared: _noun offset lands on name", SAMPLE.substr(noun.selStart, 5), "_noun");
}

// ---- diagnostics -----------------------------------------------------------
{
	const problems = computeProblems(SAMPLE);
	eq("diagnostics: exactly one problem in sample", problems.length, 1);
	check("diagnostics: unclosed bracket", problems.length === 1 && problems[0].code === "nlp.unclosed-bracket",
		problems.map((p) => p.code).join(","));

	eq("diagnostics: balanced code clean", computeProblems("@CODE\nx = (1 + 2);\n@@CODE\n").length, 0);

	const unterm = computeProblems("@CODE\n/* never closed\n@@CODE\n");
	check("diagnostics: unterminated comment flagged",
		unterm.some((p) => p.code === "nlp.unterminated-comment"));

	// Brackets inside strings/comments must NOT count.
	eq("diagnostics: bracket in string ignored", computeProblems('@CODE\ns = "a ( b";\n@@CODE\n').length, 0);
	eq("diagnostics: mismatched pair flagged", computeProblems("@CODE\nx = (1];\n@@CODE\n").length > 0, true);
}

// ---- engine errors ---------------------------------------------------------
{
	const log = [
		"Analyzing file foo.txt",
		"12 5 unknown function 'pnvarr'",
		"3 0 zero line number should be skipped",
		"7 22 attribute 'xyz' ignored here",
		"45 8 [bad entry - words.dict]",
		"random progress text",
	].join("\n");
	const errs = parseEngineErrors(log);
	eq("engine: 3 located errors", errs.length, 3);
	const pass = errs.find((e) => e.kind === "pass" && e.lineNum === 5);
	check("engine: pass error line 5 is error", !!pass && pass.severity === "error");
	const warn = errs.find((e) => e.lineNum === 22);
	check("engine: 'ignored' -> warning", !!warn && warn.severity === "warning");
	const dict = errs.find((e) => e.kind === "dict");
	check("engine: dict file resolved", !!dict && dict.dictFile === "words.dict");
	eq("engine: dict line is first number", dict ? dict.lineNum : -1, 45);
}

// ---- KB concepts -----------------------------------------------------------
{
	const kb = `# knowledge base
animal
  dog
    n=3
    [ pos=noun ]
  cat: felis
plant
  tree [ genus=quercus ]
42
attr=value
`;
	const names = parseKbConcepts(kb).map((c) => c.name);
	check("kb: concepts extracted",
		["animal", "dog", "cat", "plant", "tree"].every((n) => names.includes(n)), names.join(","));
	check("kb: attribute line 'n=3' skipped", !names.includes("n=3"));
	check("kb: 'attr=value' skipped", !names.some((n) => n.includes("=")));
	check("kb: bare number skipped", !names.includes("42"));
	const c = parseKbConcepts(kb).find((x) => x.name === "dog")!;
	eq("kb: dog offset lands on name", kb.substr(c.start, 3), "dog");
}

// ---- completion region context ---------------------------------------------
{
	eq("completion: @DECL body is Code", regionKindAt(SAMPLE, SAMPLE.indexOf("myHelper")), RegionKind.Code);
	eq("completion: @RULES body is Rules", regionKindAt(SAMPLE, SAMPLE.indexOf("_noun")), RegionKind.Rules);
	eq("completion: @CODE body is Code", regionKindAt(SAMPLE, SAMPLE.indexOf('G("count")')), RegionKind.Code);
}

// ---- signature help: enclosing call ----------------------------------------
{
	// Cursor inside the 2nd argument of foo(...).
	const code = `@CODE\n   foo(a, b|)\n@@CODE\n`;
	const off = code.indexOf("|"); // position of the cursor marker
	const text = code.replace("|", "");
	const call = findEnclosingCall(text, off);
	check("signature: call name resolved", !!call && call.name === "foo", JSON.stringify(call));
	eq("signature: active param index", call ? call.activeParam : -1, 1);

	// Nested call: strval( pnvar("x"|) ) -> cursor is in pnvar's arg 0.
	const nested = `@CODE\n strval( pnvar("x") )\n@@CODE\n`;
	const at = nested.indexOf('"x"') + 1;
	const c2 = findEnclosingCall(nested, at);
	check("signature: nested call resolves inner fn", !!c2 && c2.name === "pnvar", JSON.stringify(c2));
	eq("signature: nested active param", c2 ? c2.activeParam : -1, 0);

	// A comma inside a string must not advance the active parameter.
	const str = `@CODE\n bar("a, b, c"|)\n@@CODE\n`;
	const soff = str.indexOf("|");
	const c3 = findEnclosingCall(str.replace("|", ""), soff);
	eq("signature: comma in string ignored", c3 ? c3.activeParam : -1, 0);

	// Not inside any call.
	check("signature: no call outside parens", findEnclosingCall("@CODE\n x = 1\n@@CODE\n", 12) === undefined);
}

// ---- built-in data tables --------------------------------------------------
{
	check("data: builtins non-empty", BUILTIN_FUNCTIONS.length > 100);
	check("data: builtin set matches list size", BUILTIN_SET.size <= BUILTIN_FUNCTIONS.length && BUILTIN_SET.size > 100);
	check("data: strlength is a builtin", BUILTIN_SET.has("strlength"));
	check("data: 'if' is a keyword", KEYWORD_SET.has("if"));
}

console.log(`\nlanguage tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
