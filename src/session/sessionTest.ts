// Tests for the session helpers. Runs with plain Node via `npm run test:session`.

import * as path from "path";
import { analyzerFiles, isInside, pushRecent, samePath } from "./session";
import { modHeaderPath, modParts, modSection } from "./modPaths";
import { generatorChanged, kbOutputsOf } from "./kbGen";

let passed = 0;
let failed = 0;

function eq(name: string, got: unknown, want: unknown): void {
	if (JSON.stringify(got) === JSON.stringify(want)) {
		passed++;
	} else {
		failed++;
		console.error(`  FAIL: ${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`);
	}
}

const ana = path.resolve("analyzers", "parse-en");
const other = path.resolve("analyzers", "parse-en-us"); // shares a name prefix
const f = (...p: string[]) => path.join(ana, ...p);

// ---- isInside ----------------------------------------------------------------
eq("inside: spec file", isInside(ana, f("spec", "tokens.nlp")), true);
eq("inside: the directory itself is not", isInside(ana, ana), false);
eq("inside: sibling with a shared prefix is not", isInside(ana, path.join(other, "spec", "a.nlp")), false);
eq("inside: parent is not", isInside(ana, path.dirname(ana)), false);
eq("inside: trailing separator on dir", isInside(ana + path.sep, f("kb", "user", "a.dict")), true);
eq("inside: empty dir", isInside("", f("a")), false);
if (process.platform === "win32") {
	eq("inside: drive-letter case", isInside(ana.toUpperCase(), f("spec", "x.nlp")), true);
}

// ---- analyzerFiles -----------------------------------------------------------
eq("files: keeps only this analyzer's, relative, in order", analyzerFiles(ana, [
	f("spec", "b.nlp"),
	path.join(other, "spec", "c.nlp"),
	f("input", "text.txt"),
	f("spec", "b.nlp"), // open in two editor groups
]), [path.join("spec", "b.nlp"), path.join("input", "text.txt")]);
eq("files: none open", analyzerFiles(ana, []), []);

// ---- pushRecent --------------------------------------------------------------
eq("recent: new goes first", pushRecent(["/a", "/b"], "/c"), ["/c", "/a", "/b"]);
eq("recent: existing moves to front", pushRecent(["/a", "/b", "/c"], "/b"), ["/b", "/a", "/c"]);
eq("recent: capped", pushRecent(["/a", "/b", "/c"], "/d", 3), ["/d", "/a", "/b"]);
eq("recent: trailing separator is the same analyzer", pushRecent([ana + path.sep], ana), [ana]);

// ---- samePath ----------------------------------------------------------------
eq("same: trailing separator", samePath(ana + path.sep, ana), true);
eq("same: prefix sibling differs", samePath(ana, other), false);
eq("same: empty never matches", samePath("", ""), false);

// ---- mod file paths ------------------------------------------------------------
eq("mod: header with backslashes", modParts("kb\\user\\en-numbers.dict"), ["kb", "user", "en-numbers.dict"]);
eq("mod: header with slashes", modParts("spec/numbers.nlp"), ["spec", "numbers.nlp"]);
eq("mod: kb section from a Windows header", modSection("kb\\user\\en-numbers.dict"), "kb");
eq("mod: spec section from a POSIX absolute path", modSection("/home/me/ana/spec/numbers.nlp"), "spec");
eq("mod: input section from a Windows absolute path", modSection("C:\\ana\\input\\numbers.txt"), "input");
eq("mod: kb only under kb/user", modSection("/ana/kb/numbers.kb"), undefined);
eq("mod: header written with backslashes", modHeaderPath("kb/user", "x.dict"), "kb\\user\\x.dict");

// ---- KB generator passes (#272) --------------------------------------------------
eq("kbgen: SaveKB target", kbOutputsOf('@CODE\nSaveKB("mykb.kbb",G("kb"),2);\n@@CODE'), ["mykb.kbb"]);
eq("kbgen: dict written with <<, once", kbOutputsOf('L("f") = "words.dict"; "words.dict" << x; "out.txt" << y;'), ["words.dict"]);
eq("kbgen: paths are not plain names", kbOutputsOf('SaveKB("kb/user/x.kbb", G("kb"), 2);'), []);
eq("kbgen: nothing written", kbOutputsOf("@RULES\n_x <- a @@"), []);
eq("kbgen: never copied counts as changed", generatorChanged(5, undefined), true);
eq("kbgen: unchanged since the copy", generatorChanged(5, 5), false);
eq("kbgen: edited after the copy", generatorChanged(6, 5), true);

console.log(`\nsession tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
