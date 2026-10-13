// Pure structural linter for NLP++ pass files.
//
// PURE MODULE: no 'vscode' import. Returns offset-based problems that the VSCode
// adapter maps to vscode.Diagnostic. These checks run on the lossless token
// stream, so brackets/comments inside strings or comments are never miscounted
// (the tokenizer already isolates String/LineComment/BlockComment tokens). The
// intent is near-zero false positives -- this is a static structural pass, NOT a
// substitute for the analyzer's own semantic errors.

import { tokenize } from "../format/tokenizer";
import { TokenKind } from "../format/types";

export type Severity = "error" | "warning";

export interface Problem {
	start: number;
	end: number;
	message: string;
	severity: Severity;
	code: string;
}

const OPEN_TO_CLOSE: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE_TO_OPEN: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

export function computeProblems(src: string): Problem[] {
	const problems: Problem[] = [];
	const tokens = tokenize(src);

	// 1) Unterminated block comment: a BlockComment token that never closed.
	for (const t of tokens) {
		if (t.kind === TokenKind.BlockComment && !t.text.endsWith("*/")) {
			problems.push({
				start: t.start,
				end: t.end,
				message: "Unterminated block comment ('/*' with no closing '*/').",
				severity: "error",
				code: "nlp.unterminated-comment",
			});
		}
	}

	// 2) Bracket balance over structural punctuation only. Strings/comments are
	// separate token kinds, so their brackets are correctly ignored.
	const stack: { ch: string; start: number }[] = [];
	for (const t of tokens) {
		if (t.kind !== TokenKind.Punct) continue;
		const ch = t.text;
		if (OPEN_TO_CLOSE[ch]) {
			stack.push({ ch, start: t.start });
		} else if (CLOSE_TO_OPEN[ch]) {
			const top = stack.pop();
			if (!top) {
				problems.push({
					start: t.start,
					end: t.end,
					message: `Unmatched '${ch}'.`,
					severity: "error",
					code: "nlp.unmatched-bracket",
				});
			} else if (OPEN_TO_CLOSE[top.ch] !== ch) {
				problems.push({
					start: t.start,
					end: t.end,
					message: `Mismatched '${ch}' -- expected '${OPEN_TO_CLOSE[top.ch]}' to close '${top.ch}'.`,
					severity: "error",
					code: "nlp.mismatched-bracket",
				});
			}
		}
	}
	for (const open of stack) {
		problems.push({
			start: open.start,
			end: open.start + 1,
			message: `Unclosed '${open.ch}' -- no matching '${OPEN_TO_CLOSE[open.ch]}'.`,
			severity: "error",
			code: "nlp.unclosed-bracket",
		});
	}

	// 3) Wildcards the engine refuses to match (#835).
	problems.push(...wildcardProblems(src, tokens));

	return problems;
}

// --- Wildcard placement -----------------------------------------------------
// Mirrors nlp-engine Pat::warnWild ("[Unimplemented: wildcard trigger, start, or
// end.]"). An element is a true wildcard only when it is _xWILD with no
// match/fail list and no @PRE condition (Ielt::wild). The engine cannot fill a
// wildcard that is the trigger, or that has nothing but optional elements
// between it and an end of the rule: it fails the rule instead.

interface RuleElt {
	start: number;
	end: number;
	num: number;      // 1-based element number (as used by @PRE <n,m>)
	wild: boolean;
	optional: boolean; // min == 0
	trigger: boolean;
}

const LIST_KEYS = new Set(["match", "matches", "fail", "fails"]);
const OPT_KEYS = new Set(["optional", "option", "opt", "o", "star", "*"]);
const REQ_KEYS = new Set(["plus", "+", "one", "1"]);
const TRIG_KEYS = new Set(["trigger", "trig", "t"]);

function regionKeyword(t: { text: string }): string {
	return t.text.replace(/^@+/, "").toUpperCase();
}

function wildcardProblems(src: string, tokens: ReturnType<typeof tokenize>): Problem[] {
	const problems: Problem[] = [];
	let region = "";
	let preElts = new Set<number>(); // element numbers covered by the current @PRE
	let sawRules = false;

	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.kind === TokenKind.Directive) {
			const kw = regionKeyword(t);
			if (t.text.startsWith("@@")) { region = ""; continue; }
			// A @PRE/@CHECK/@POST after a @RULES starts the next region group.
			if (sawRules && (kw === "PRE" || kw === "CHECK" || kw === "POST")) {
				preElts = new Set();
				sawRules = false;
			}
			region = kw;
			if (kw === "RULES") sawRules = true;
			continue;
		}
		if (region === "PRE" && t.kind === TokenKind.Word) {
			// "<2,3>" tokenizes as "<2" "," "3>"; scan the raw text from here.
			const m = /^<\s*(\d+)\s*,\s*(\d+)\s*>/.exec(src.slice(t.start, t.start + 40));
			if (m) {
				for (let n = Number(m[1]); n <= Number(m[2]); n++) preElts.add(n);
			}
			continue;
		}
		if (region === "RULES" && t.kind === TokenKind.Arrow) {
			const elts: RuleElt[] = [];
			i = parseRuleElts(tokens, i + 1, elts);
			for (const e of elts) {
				if (preElts.has(e.num)) e.wild = false;
			}
			problems.push(...checkRuleWilds(elts));
		}
	}
	return problems;
}

// Parse rule elements after "<-" up to "@@". Returns the index of the last token consumed.
function parseRuleElts(tokens: ReturnType<typeof tokenize>, i: number, out: RuleElt[]): number {
	let cur: RuleElt | undefined;
	let keys: string[] = [];
	const finish = () => {
		if (!cur) return;
		// Ielt::fillDefaults: _xWILD defaults to min=0, everything else to min=1.
		let optional = cur.wild;
		for (const k of keys) {
			const [name, val] = k.split("=");
			if (LIST_KEYS.has(name)) cur.wild = false;
			else if (OPT_KEYS.has(name)) optional = true;
			else if (REQ_KEYS.has(name)) optional = false;
			else if (TRIG_KEYS.has(name)) cur.trigger = true;
			else if (name === "min" && val !== undefined && /^\d+$/.test(val)) optional = Number(val) === 0;
		}
		cur.optional = optional;
		out.push(cur);
		cur = undefined;
		keys = [];
	};

	for (; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.kind === TokenKind.AtAt || t.kind === TokenKind.Directive) {
			finish();
			return t.kind === TokenKind.Directive ? i - 1 : i;
		}
		if (t.kind === TokenKind.Punct && t.text === "[" && cur) {
			// Collect top-level modifier words; skip parenthesized lists.
			let depth = 0;
			let text = "";
			for (i++; i < tokens.length; i++) {
				const m = tokens[i];
				if (m.kind === TokenKind.AtAt || m.kind === TokenKind.Directive) { i--; break; }
				if (m.kind === TokenKind.Punct) {
					// Keep a "()" placeholder so "except=(..) match=(..)" stays two keys.
					if (m.text === "(") { if (depth++ === 0) text += "()"; continue; }
					if (m.text === ")") { depth--; continue; }
					if (m.text === "]" && depth <= 0) break;
					continue;
				}
				if (depth > 0) continue;
				if (m.kind === TokenKind.Word) text += m.text;
				else if (m.kind === TokenKind.Whitespace || m.kind === TokenKind.Newline) text += " ";
			}
			keys = text.replace(/\s*=\s*/g, "=").trim().toLowerCase().split(/\s+/).filter((k) => k.length);
			finish();
			continue;
		}
		if (t.kind === TokenKind.Word || t.kind === TokenKind.String) {
			finish();
			cur = {
				start: t.start,
				end: t.end,
				num: out.length + 1,
				wild: t.text.toLowerCase() === "_xwild",
				optional: false,
				trigger: false,
			};
		}
	}
	finish();
	return i;
}

function checkRuleWilds(elts: RuleElt[]): Problem[] {
	if (!elts.length) return [];
	const problems: Problem[] = [];
	let trig = elts.findIndex((e) => e.trigger);
	if (trig < 0) trig = 0;
	const flag = (e: RuleElt, message: string, severity: Severity) =>
		problems.push({ start: e.start, end: e.end, message, severity, code: "nlp.wildcard-placement" });

	if (elts[trig].wild) {
		flag(elts[trig], "Wildcard cannot be the rule's trigger (or first element). The engine skips this rule: [Unimplemented: wildcard trigger, start, or end.]", "error");
	}

	// Rightward from the trigger: the outermost wildcard needs a required element after it.
	for (let k = elts.length - 1; k > trig; k--) {
		if (!elts[k].wild) continue;
		const after = elts.slice(k + 1);
		if (after.every((e) => e.optional)) {
			flag(elts[k], after.length
				? "Wildcard is followed only by optional elements; the engine fails this rule whenever they don't match: [Unimplemented: wildcard trigger, start, or end.]"
				: "Wildcard cannot end a rule (use _xANY for exactly one node, or add a match list). The engine skips this rule: [Unimplemented: wildcard trigger, start, or end.]",
			after.length ? "warning" : "error");
		}
		break;
	}

	// Leftward from the trigger: same, toward the start of the rule.
	for (let k = 0; k < trig; k++) {
		if (!elts[k].wild) continue;
		const before = elts.slice(0, k);
		if (before.every((e) => e.optional)) {
			flag(elts[k], before.length
				? "Wildcard is preceded only by optional elements; the engine fails this rule whenever they don't match: [Unimplemented: wildcard trigger, start, or end.]"
				: "Wildcard cannot start a rule (use _xANY for exactly one node, or add a match list). The engine skips this rule: [Unimplemented: wildcard trigger, start, or end.]",
			before.length ? "warning" : "error");
		}
		break;
	}

	return problems;
}
