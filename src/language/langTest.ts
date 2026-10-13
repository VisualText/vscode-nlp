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
import { foldingRanges } from "./folding";
import { RENAMED_SCOPES, migrateScope, migrateTokenColors } from "./scopeMigration";
import * as fs from "fs";
import * as path from "path";
import { RuleLocator, visualColumn } from "./ruleLocator";
import { classifyTokens } from "./semanticTokens";
import { findUnknownCalls, levenshtein } from "./quickfix";
import { BUILTIN_SET, KEYWORD_SET, BUILTIN_FUNCTIONS, RULE_KEYWORDS } from "./nlpxxData";
import {
	blankBlockCommentLines, blankBlockComments, hasMultiLineBlockComment, isCommentOnly,
} from "./blockComment";
import { NlpWorkspaceIndex, sameFile } from "../server/workspaceIndex";

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

// ---- wildcard placement (#835) ---------------------------------------------
{
	const wild = (rules: string, pre = "") =>
		computeProblems(`${pre}@RULES\n${rules}\n`).filter((p) => p.code === "nlp.wildcard-placement");

	// The rule from #835: trailing wildcard followed only by an optional element.
	const issue = wild([
		"_unregMv <-",
		"\t_xWILD [one match=(_unregistered unreg _unlicensed)]",
		"\t_xWILD",
		"\t_xWILD [one match=(_mv _motorvehicle _vehicle)]",
		"\t_xWILD",
		"\t_xWILD [opt match=(_numDash _date)]",
		"\t@@",
	].join("\n"));
	eq("wildcard: #835 rule flagged once", issue.length, 1);
	check("wildcard: #835 flags the 4th element (a warning)",
		issue.length === 1 && issue[0].severity === "warning" && issue[0].start > 0, JSON.stringify(issue));

	eq("wildcard: wildcard between required elts clean", wild("_x <- a _xWILD b @@").length, 0);
	eq("wildcard: match-list wildcards are not wild", wild("_x <- _xWILD [one match=(a b)] _xWILD [match=(c)] @@").length, 0);
	eq("wildcard: match list after except list counts", wild("_x <- _xWILD [s one\r\n\texcept=(a b)\r\n\tmatch=(\r\nc\r\n)] @@").length, 0);
	eq("wildcard: fail-list wildcard not wild", wild("_x <- a _xWILD [fail=(c)] @@").length, 0);
	check("wildcard: wildcard ends rule is error", wild("_x <- a _xWILD @@").some((p) => p.severity === "error"));
	check("wildcard: wildcard starts rule is error", wild("_x <- _xWILD a @@").some((p) => p.severity === "error"));
	check("wildcard: wildcard trigger flagged", wild("_x <- a _xWILD [trig] b @@").length > 0);
	check("wildcard: wildcard left of trigger flagged", wild("_x <- _xWILD [min=1] a [t] @@").length > 0);
	eq("wildcard: required elt after wildcard (plus) clean", wild("_x <- a _xWILD _xWILD [+ match=(b)] @@").length, 0);
	eq("wildcard: min=1 elt after wildcard clean", wild("_x <- a _xWILD _xWILD [min = 1 match=(b)] @@").length, 0);
	eq("wildcard: @PRE makes _xWILD a non-wildcard", wild("_x <- a _xWILD @@", "@PRE\n<2,2> cap();\n").length, 0);
	eq("wildcard: @PRE of an earlier group does not leak", wild("_x <- a _xWILD @@", "@PRE\n<2,2> cap();\n@RULES\n_y <- a b @@\n@POST\nsingle();\n").length, 1);
	eq("wildcard: _xWILD in @CODE ignored", computeProblems("@CODE\nG(\"_xWILD\") = 1;\n@@CODE\n").length, 0);
}

// ---- rule locator (#787) ---------------------------------------------------
{
	// Numbering verified against the engine's G("$rulenum"): 1-based across every
	// @RULES region in the file; @RECURSE mini-pass rules are not counted.
	const src = [
		"@POST",
		"  single();",
		"@RULES",
		"_np [base] <- _det [opt] _noun @@",
		"_vp <-",
		"\t_verb\t### (1)",
		"\t_xWILD [one match=(_np _pro)]\t### (2)",
		"\t@@",
		"@RECURSE inner",
		"@RULES",
		"_x <- inner @@",
		"@@RULES",
		"@@RECURSE inner",
		"@POST",
		"  single();",
		"@RULES",
		"_s <- \\( _np \\) @@",
		"",
	].join("\n");
	const loc = new RuleLocator(src);
	const at = (needle: string, nth = 0) => {
		let i = -1;
		for (let k = 0; k <= nth; k++) i = src.indexOf(needle, i + 1);
		return loc.at(i);
	};
	eq("locator: three top-level rules", loc.ruleCount, 3);
	eq("locator: suggested elt is rule 1 elt 0", JSON.stringify(at("_np [base]")), JSON.stringify({ rule: 1, elt: 0 }));
	eq("locator: modifier belongs to its element", JSON.stringify(at("opt")), JSON.stringify({ rule: 1, elt: 1 }));
	eq("locator: second element", JSON.stringify(at("_noun")), JSON.stringify({ rule: 1, elt: 2 }));
	eq("locator: multi-line rule elt 1", JSON.stringify(at("_verb")), JSON.stringify({ rule: 2, elt: 1 }));
	eq("locator: match list inside elt 2", JSON.stringify(at("_pro")), JSON.stringify({ rule: 2, elt: 2 }));
	eq("locator: comment between elts", at("### (1)")?.elt, -1);
	eq("locator: @RECURSE rules not numbered", at("inner @@"), undefined);
	eq("locator: rule after recurse is 3", JSON.stringify(at("_np", 2)), JSON.stringify({ rule: 3, elt: 2 }));
	eq("locator: escaped paren is an element", at("\\)")?.elt, 3);
	eq("locator: code region is no rule", at("single"), undefined);

	eq("column: no tabs", visualColumn("abc", 2, 4), 3);
	eq("column: leading tab", visualColumn("\tx", 1, 4), 5);
	eq("column: tab to next stop", visualColumn("ab\tx", 3, 4), 5);
	eq("column: two tabs", visualColumn("\t\tx", 2, 4), 9);
}

// ---- scope migration (#107) ------------------------------------------------
{
	// The map must match the grammars it describes: no old name may survive in
	// them unless it maps to itself, and every new name must exist in one.
	const dir = path.join(__dirname, "..", "..", "grammars", "syntaxes");
	const names = new Set<string>();
	const walk = (o: unknown): void => {
		if (Array.isArray(o)) o.forEach(walk);
		else if (o && typeof o === "object") {
			for (const [k, v] of Object.entries(o)) {
				if ((k === "name" || k === "contentName") && typeof v === "string") names.add(v);
				else walk(v);
			}
		}
	};
	for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) walk(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
	for (const [oldName, renamed] of Object.entries(RENAMED_SCOPES)) {
		check(`scopes: ${oldName} gone from grammars`, renamed.includes(oldName) || !names.has(oldName));
		for (const n of renamed) check(`scopes: ${n} exists in a grammar`, names.has(n));
	}

	eq("scopes: one-to-one", JSON.stringify(migrateScope("keyword.region.nlp")), JSON.stringify({ scope: "keyword.control.directive.region.nlp", changed: true }));
	eq("scopes: one-to-many keeps all", JSON.stringify(migrateScope("comment.line.dict").scope),
		JSON.stringify(["entity.name.tag.dict", "comment.line.dict", "comment.line.kb", "comment.line.kbb", "comment.line.tree"]));
	eq("scopes: list, deduplicated", JSON.stringify(migrateScope(["keyword.operator.nlp", "keyword.equals.nlp", "keyword.operator.assignment.nlp"]).scope),
		JSON.stringify(["keyword.operator.nlp", "keyword.operator.assignment.nlp"]));
	eq("scopes: comma string", JSON.stringify(migrateScope("keyword.fired.tree, keyword.rewrite.tree").scope),
		JSON.stringify(["keyword.other.fired.tree", "entity.name.type.tree"]));
	eq("scopes: unknown untouched", migrateScope("source.js keyword").changed, false);

	const settings: Record<string, unknown> = {
		"files.eol": "lf",
		"editor.tokenColorCustomizations": {
			"textMateRules": [{ scope: "keyword.constants.nlp", settings: { foreground: "#0a7b83" } }],
			"[*Dark*]": { textMateRules: [{ scope: "keyword.fired.tree", settings: { foreground: "#ff0000" } }, { name: "no scope" }] },
		},
	};
	check("scopes: settings migrated", migrateTokenColors(settings));
	const block = settings["editor.tokenColorCustomizations"] as { textMateRules: { scope: string }[]; "[*Dark*]": { textMateRules: { scope?: string }[] } };
	eq("scopes: top-level rule", block.textMateRules[0].scope, "constant.language.nlp");
	eq("scopes: per-theme rule", block["[*Dark*]"].textMateRules[0].scope, "keyword.other.fired.tree");
	eq("scopes: second run is a no-op", migrateTokenColors(settings), false);
	eq("scopes: no block", migrateTokenColors({ "files.eol": "lf" }), false);
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

// ---- folding ---------------------------------------------------------------
{
	// A multi-line rule so we can assert a per-rule fold, plus regions.
	const src = [
		"@RULES",          // line 0
		"_np <-",          // line 1
		"    adj [s]",     // line 2
		"    noun @@",     // line 3
		"@@",              // line 4
		"@CODE",           // line 5
		'   G("x") = 1;',  // line 6
		"   y = 2;",       // line 7
		"@@CODE",          // line 8
		"",                // line 9
	].join("\n");
	const folds = foldingRanges(src);
	// Every fold must span more than one line.
	check("folding: all ranges multi-line", folds.every((f) => f.end > f.start), JSON.stringify(folds));
	// The @RULES region fold starts at line 0.
	check("folding: @RULES region folds from line 0", folds.some((f) => f.start === 0 && f.end >= 3), JSON.stringify(folds));
	// The multi-line rule _np (lines 1-3) folds.
	check("folding: rule _np folds", folds.some((f) => f.start === 1 && f.end === 3), JSON.stringify(folds));
	// The @CODE region (lines 5-8) folds.
	check("folding: @CODE region folds", folds.some((f) => f.start === 5 && f.end >= 7), JSON.stringify(folds));

	// A region that is only its marker line (nothing below) yields no fold.
	eq("folding: marker-only region no fold", foldingRanges("@RULES\n").length, 0);
	// A single-line rule produces no per-rule fold (region still folds if multi-line).
	check("folding: single-line rule not folded",
		!foldingRanges("@RULES\n_x <- a @@\n_y <- b @@\n").some((f) => f.start === f.end));
}

// ---- semantic tokens -------------------------------------------------------
{
	const sets = {
		letters: new Set(["N", "S", "X", "G", "L"]),
		userFuncs: new Set(["myHelper"]),
		concepts: new Set(["animal"]),
		rules: new Set(["_noun"]),
		builtins: new Set(["strlength", "pnvar"]),
	};
	const code = `@CODE\n x = strlength("a");\n myHelper(L("y"));\n animal\n _noun\n@@CODE\n`;
	const toks = classifyTokens(code, sets);
	const typeOf = (name: string) => {
		const off = code.indexOf(name);
		return toks.find((t) => t.start === off)?.type;
	};
	eq("semantic: builtin -> function", typeOf("strlength"), "function");
	eq("semantic: user func -> method", typeOf("myHelper"), "method");
	eq("semantic: accessor L -> macro", typeOf("L("), "macro"); // indexOf('L(') lands on the L token
	eq("semantic: concept -> class", typeOf("animal"), "class");
	eq("semantic: rule -> type", typeOf("_noun"), "type");
	// Unknown identifier 'x' is not classified.
	check("semantic: unknown identifier skipped", !toks.some((t) => code.substr(t.start, t.length) === "x"));
}

// ---- quick fix: misspelled function calls ----------------------------------
{
	eq("levenshtein: identical", levenshtein("pnvar", "pnvar"), 0);
	eq("levenshtein: one edit", levenshtein("pnvarr", "pnvar"), 1);

	const known = ["pnvar", "strlength", "findconcept"];
	const isKnown = (w: string) => known.includes(w) || w === "if";
	// 'pnvarr(' is a close typo of 'pnvar' inside a code region -> flagged.
	const src = `@CODE\n   x = pnvarr("a");\n@@CODE\n`;
	const found = findUnknownCalls(src, isKnown, known);
	eq("quickfix: one unknown call", found.length, 1);
	eq("quickfix: word", found[0]?.word, "pnvarr");
	eq("quickfix: suggestion", found[0]?.suggestion, "pnvar");

	// A known call is not flagged.
	eq("quickfix: known call ignored", findUnknownCalls(`@CODE\n pnvar("a");\n@@CODE\n`, isKnown, known).length, 0);
	// A call in a RULES region is out of scope (not code).
	eq("quickfix: rules region ignored", findUnknownCalls(`@RULES\n pnvarr("a")\n@@\n`, isKnown, known).length, 0);
	// A far-off identifier (no close match) is not flagged -- high precision.
	eq("quickfix: no close match ignored", findUnknownCalls(`@CODE\n zzqqxx("a");\n@@CODE\n`, isKnown, known).length, 0);
}

// ---- block-comment blanking (data formats) ---------------------------------
{
	const one = (s: string) => blankBlockCommentLines([s])[0];

	// Comments become spaces, so every other column keeps its offset.
	eq("blank: same length", one("nlp\tfoo\t/* c */").length, "nlp\tfoo\t/* c */".length);
	eq("blank: comment gone", one("nlp\tfoo\t/* c */"), "nlp\tfoo\t       ");
	// Non-nesting: the FIRST '*/' closes.
	eq("blank: no nesting", one("a /* x /* y */ b"), "a              b");
	// A star inside the comment is not a terminator.
	eq("blank: star inside", one("/* a * b */x"), "           x");
	// Delimiters inside a string or after '#' are ordinary text.
	eq("blank: string wins", one('a "/* not */" b'), 'a "/* not */" b');
	eq("blank: line comment wins", one("a # /* not */"), "a # /* not */");
	// Unterminated runs to end of input.
	eq("blank: unterminated", one("a /* b"), "a     ");

	// State carries across lines; the middle line vanishes entirely.
	const span = blankBlockCommentLines(["a /* x", "y", "z */ b"]);
	eq("blank: multiline first", span[0], "a     ");
	eq("blank: multiline middle", span[1], " ");
	eq("blank: multiline last", span[2], "     b");
	check("blank: multiline detected", hasMultiLineBlockComment(["a /* x", "z */ b"]));
	check("blank: single line not multiline", !hasMultiLineBlockComment(["a /* x */ b", "c"]));
	// An unterminated string must not leak into the next line.
	check("blank: string does not leak", !hasMultiLineBlockComment(['a "unclosed', "b /* c */"]));

	// isCommentOnly separates a comment line from content and from blank lines.
	check("blank: comment-only line", isCommentOnly("  /* note */  ", one("  /* note */  ")));
	check("blank: content line not comment-only", !isCommentOnly("nlp\tfoo\t/* c */", one("nlp\tfoo\t/* c */")));
	check("blank: empty line not comment-only", !isCommentOnly("   ", "   "));

	// The whole-text wrapper preserves separators, CRLF included.
	eq("blank: text keeps CRLF", blankBlockComments("a /* x */\r\nb"), "a        \r\nb");
	eq("blank: text keeps trailing newline", blankBlockComments("a\n"), "a\n");
}

// ---- built-in data tables --------------------------------------------------
{
	check("data: builtins non-empty", BUILTIN_FUNCTIONS.length > 100);
	check("data: builtin set matches list size", BUILTIN_SET.size <= BUILTIN_FUNCTIONS.length && BUILTIN_SET.size > 100);
	check("data: strlength is a builtin", BUILTIN_SET.has("strlength"));
	check("data: 'if' is a keyword", KEYWORD_SET.has("if"));
	check("data: 'base' is a rule modifier", RULE_KEYWORDS.includes("base"));
}

// ---- server index: one file, two URI spellings ------------------------------
{
	// VSCode sends file:///c%3A/..., Neovim on Windows sends file:///C:/... for
	// the same file. The index must treat them as one file, or every reference
	// doubles and rename emits overlapping edits.
	const index = new NlpWorkspaceIndex({ list: async () => [], read: async () => undefined });
	const vscodeUri = "file:///c%3A/ana/spec/pass.nlp";
	const nvimUri = "file:///C:/ana/spec/pass.nlp";
	const src = "@DECL\nmyFn(L(\"x\")) {\n}\n@@DECL\n@CODE\nmyFn(1);\n@@CODE\n";
	check("uri: spellings are the same file", sameFile(vscodeUri, nvimUri));
	check("uri: different files differ", !sameFile(nvimUri, "file:///C:/ana/spec/other.nlp"));

	index.indexText(vscodeUri, src); // workspace scan
	index.indexText(nvimUri, src);   // client opens the same file
	eq("uri: one declaration after reindex", index.lookup("myFn").length, 1);
	eq("uri: references not doubled", index.references("myFn").length, 2);
	eq("uri: entries carry the latest spelling", index.lookup("myFn")[0].uri, nvimUri);

	index.removeFile(vscodeUri); // delete event in the other spelling
	eq("uri: removal by other spelling", index.lookup("myFn").length, 0);
	eq("uri: references removed too", index.references("myFn").length, 0);
}

console.log(`\nlanguage tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
