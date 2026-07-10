// Rules-region formatter (pure).
//
// This is the single source of truth for formatting a single NLP++ rule (the
// text spanning "_suggested <- ... @@"). It is the exact logic that previously
// lived in NLPFile.formatRule / constructLine / tabString in nlp.ts, lifted out
// verbatim and parameterized on the end-of-line separator so it carries no
// dependency on vscode. nlp.ts now delegates to formatRuleText() so the manual
// "Reformat Rule" commands and the whole-document formatter share one code path
// (including the #1065 / #1077 comment-numbering fixes).

import { ReformatType, FormatOptions, TokenKind } from "./types";
import { tokenize } from "./tokenizer";

// A line begins a rule when (ignoring leading whitespace) it looks like
//   _name [attrs...] <-
// i.e. an identifier, optional bracketed attribute groups, then the arrow.
const RULE_START = /^\s*[_\w]+\s*(\[[^\]]*\])*\s*<-/;

// Format an entire @RULES / @MULTI region. The marker line and any comment or
// blank lines between rules are preserved verbatim; each rule (from its
// "_name <-" line through its "@@") is reflowed via formatRuleText. Idempotent:
// re-running over already-formatted output yields identical text, because
// formatRuleText reproduces its own canonical form (the #1077 fix).
export function formatRulesRegion(regionText: string, opts: FormatOptions): string {
	const eol = opts.eol;
	const lines = regionText.split(/\r\n|\r|\n/);
	const out: string[] = [];

	let i = 0;
	while (i < lines.length) {
		const line = lines[i];

		if (RULE_START.test(line)) {
			// Collect the rule body through the line containing "@@".
			const buf: string[] = [line];
			let j = i;
			while (j < lines.length && lines[j].indexOf("@@") < 0) {
				j++;
				if (j < lines.length) buf.push(lines[j]);
			}
			// buf now spans the rule start through the "@@" line (or EOF if the
			// terminator is missing — degrade gracefully by passing it through).
			if (j < lines.length) {
				const original = buf.join(eol);
				out.push(formatRuleSafe(original, eol));
				i = j + 1;
				continue;
			}
			// No "@@" found: emit untouched to avoid mangling a malformed rule.
			out.push(line);
			i++;
			continue;
		}

		out.push(line);
		i++;
	}

	return out.join(eol);
}

interface ruleParse {
	suggested: string;
	rule: string;
	comment: string;
}

// The semantic "spine" of a rule: the ordered non-comment, non-whitespace
// tokens (suggested name, `<-`, element nodes, attribute brackets, `@@`).
// Formatting is only allowed to touch whitespace, line breaks, and the
// auto-generated `### (N)` comments -- never this spine. Comparing the spine of
// the input to the spine of the formatted output is what proves a reformat did
// not change what the rule matches.
function ruleSpine(text: string): string {
	let s = "";
	for (const t of tokenize(text)) {
		switch (t.kind) {
			case TokenKind.Whitespace:
			case TokenKind.Newline:
			case TokenKind.LineComment:
			case TokenKind.BlockComment:
				continue;
			default:
				s += t.text + " "; // space-separate so adjacent tokens can't merge
		}
	}
	return s;
}

// Format one rule, accepting the result only if it is BOTH:
//   1. a fixpoint reached within a few iterations (so the document formatter
//      stays idempotent), and
//   2. content-preserving -- its rule spine matches the original's.
//
// Some real rules take two passes to settle (two elements sharing one source
// line split apart, then stay split): iterating converges those correctly.
// Others are genuinely mishandled by the legacy parser -- a trailing backslash
// that escapes the injected separator (diverges, never a fixpoint), or comment
// text that gets turned into elements (a fixpoint, but the spine changes). The
// two checks reject exactly those, leaving the original rule untouched. This is
// strictly stronger than a plain idempotency check: a reformat can never alter
// what a rule matches.
const MAX_ITERS = 6;
function formatRuleSafe(ruleText: string, eol: string): string {
	let a = ruleText;
	for (let k = 0; k < MAX_ITERS; k++) {
		const b = formatRuleText(a, ReformatType.NORMAL, eol);
		if (b === a) {
			// Reached a fixpoint; accept only if the spine is intact.
			return ruleSpine(a) === ruleSpine(ruleText) ? a : ruleText;
		}
		a = b;
	}
	return ruleText; // did not converge -> keep original
}

export function formatRuleText(
	ruleStr: string,
	type: ReformatType = ReformatType.NORMAL,
	eol = "\n",
): string {
	enum state { UNKNOWN, SUGGESTED, ARROW, NODE, NODE_DONE, ATTR, ATTR_END, COMMENT, ATAT }

	let formattedRule = ruleStr.replace(eol, " ");

	const rules: ruleParse[] = [];
	const rulelinesFinal = new Array();
	let words = new Array();
	let currentState = state.UNKNOWN;
	let word = "";
	let isSpace = false;
	let lastSpace = false;
	let backSlash = false;
	let suggested = false;
	let c = "";
	let cNext = "";

	// Parse rule string
	for (let i = 0; i < ruleStr.length; i++) {
		c = ruleStr[i];
		cNext = i < ruleStr.length - 1 ? ruleStr[i + 1] : "";
		isSpace = !/\S/.test(c);

		if (backSlash) {
			word += c;
			backSlash = false;
			continue;
		}
		backSlash = c == "\\" ? true : false;

		// Skip more than one space
		if (isSpace && lastSpace && c != "\n")
			continue;

		// Waiting for next or first node
		if (currentState == state.UNKNOWN && !isSpace) {
			currentState = suggested ? state.NODE : state.SUGGESTED;
			suggested = true;

			// @@
		} else if (c == "@" && cNext == "@") {
			if (word.length)
				words.push(word);
			break;

			// <-
		} else if (currentState == state.SUGGESTED && c == "<" && cNext == "-") {
			if (word.length)
				words.push(word);
			// Keep the whole suggested/rewrite node including any attribute
			// bracket (e.g. "_ENDRULE [base]"); the legacy code kept only
			// words[0], silently dropping the bracket and changing the rule.
			rules.push({ suggested: words.join(" "), rule: "", comment: "" });
			words = [];
			word = "";
			currentState = state.ARROW;
			i++;
			continue;

			// First node after arrow
		} else if (currentState == state.ARROW && !isSpace) {
			currentState = state.NODE;

			// Finished picking up the first node in a rule line
		} else if (currentState == state.NODE && (isSpace || c == "[")) {
			currentState = state.NODE_DONE;
			words.push(word);
			word = "";
			if (c == "[") {
				words.push(c);
				currentState = state.ATTR;
				word = "";
				continue;
			}

			// Found starting attribute bracket
		} else if (currentState == state.NODE_DONE && c == "[") {
			words.push(c);
			currentState = state.ATTR;
			word = "";
			continue;

			// If you have one node followed immediately by another or a new line
		} else if (currentState == state.NODE_DONE && (c == "\n" || (!isSpace && c != "[" && c != "#"))) {
			if (word.length) {
				words.push(word);
			}
			constructLine(rules, words, type);
			words = [];
			word = "";
			currentState = state.NODE;

			// Ending a bracketed attribute area
		} else if (currentState == state.ATTR && c == "]") {
			if (word.length)
				words.push(word);
			words.push(c);
			word = "";
			currentState = state.ATTR_END;
			continue;

			// Ending a bracketed attribute area
		} else if (currentState == state.ATTR && (c == ")" || c == "(")) {
			if (word.length)
				words.push(word);
			words.push(c);
			word = "";
			continue;

			// Is a comment
		} else if (currentState == state.ATTR_END && c == "#") {
			currentState = state.COMMENT;

			// New line
		} else if ((currentState == state.NODE || currentState == state.COMMENT || currentState == state.ATTR_END) && c == "\n") {
			if (word.length)
				words.push(word);
			constructLine(rules, words, type);
			words = [];
			word = "";
			currentState = state.NODE;

			// Is a new node on the same line?
		} else if (currentState == state.ATTR_END && !isSpace) {
			constructLine(rules, words, type);
			words = [];
			word = "";
			currentState = state.UNKNOWN;
		}

		if (!isSpace) {
			word += c;
		} else if (word.length && isSpace && !lastSpace) {
			if (word.startsWith("#"))
				currentState = state.COMMENT;
			words.push(word);
			word = "";
		}

		lastSpace = isSpace;
	}

	if (words.length)
		constructLine(rules, words, type);

	// Find longest line (to align the '### (N)' comment column)
	let maxLine = 0;
	for (const rule of rules) {
		if (rule.rule.length > maxLine)
			maxLine = rule.rule.length;
	}

	// Construct reformated string
	const tabsize = 4;
	const tabsMax = Math.floor(maxLine / tabsize);
	let nodeNumber = 1;
	let ruleLine = "";
	let hasAtAt = false;
	for (const rule of rules) {
		if (rule.rule == "@@") {
			ruleLine = type == ReformatType.ONELINE ? "@@" : "\t@@";
			hasAtAt = true;
		} else if (rule.suggested.length) {
			ruleLine = rule.suggested + " <-";
		} else {
			const tabstr = tabString(rule.rule.length, tabsize, tabsMax);
			if (type == ReformatType.ONELINE)
				ruleLine = rule.rule;
			else
				// Number first ("### (N) annotation") to match the auto-number
				// style used elsewhere (tree/sequence) and keep any user
				// annotation after the node number. (#1065)
				ruleLine = "\t" + rule.rule + tabstr + "### (" + nodeNumber.toString() + ")"
					+ (rule.comment.length ? " " + rule.comment : "");
			nodeNumber++;
		}
		rulelinesFinal.push(ruleLine);
	}
	if (!hasAtAt)
		rulelinesFinal.push("\t@@");

	const sep = type == ReformatType.ONELINE ? "" : eol;
	formattedRule = rulelinesFinal.join(sep);

	return formattedRule;
}

function tabString(length: number, tabsize: number, tabsmax: number): string {
	const tabsline = Math.floor(length) / tabsize;
	const tabs = tabsmax - tabsline + 1;
	let tabstr = "\t";
	for (let i = 1; i < tabs; i++) {
		tabstr = tabstr + "\t";
	}
	return tabstr;
}

function constructLine(rules: ruleParse[], words: string[], type: ReformatType) {
	// Pull the user's annotation out of the trailing comment (the tokens
	// after the first '#'-prefixed token), dropping the auto-generated node
	// number. The reformatter emits it number-first ("### (N) note"), so we
	// strip a leading run of "(N)" -- whether spaced OR glued to the next
	// word, e.g. "(2) (2)moose and stuff" -> "moose and stuff" -- plus a
	// single trailing "(N)" left over from the old number-last style. A "(N)"
	// in the middle of the annotation is the user's text and is kept.
	// (#1065, #1077)
	let commentStart = words.length;   // index of the '#'-token, or words.length if none
	for (let i = words.length - 1; i >= 0; i--) {
		if (words[i].startsWith("#")) {
			commentStart = i;
			break;
		}
	}
	let userComment = "";
	if (commentStart < words.length) {
		userComment = words.slice(commentStart + 1).join(" ")
			.replace(/^(?:\(\d+\)\s*)+/, "")
			.replace(/\s*\(\d+\)\s*$/, "")
			.trim();
	}
	let word = "";  // Declare word here

	// Construct Line
	if (!words.length)
		return "";
	let line = "";
	let nextWord = "";
	let lastWord = "";
	let parenFlag = false;

	for (let i = 0; i < words.length; i++) {
		if (commentStart && i == commentStart)
			break;
		word = words[i];
		nextWord = i < words.length - 1 ? words[i + 1] : "";

		if (type == ReformatType.PARENS && (word == "(" || word == ")")) {
			parenFlag = word == "(" ? true : false;
			if (word == ")")
				line += "\n\t\t";
		} else if (parenFlag) {
			line += "\n\t\t\t";
		}
		line += word;
		if (i < words.length - 1 && word != "[" && word != "(" && !word.endsWith("=")
			&& nextWord != ")" && nextWord != "]" && nextWord != "="
			&& lastWord != "=")
			line += " ";
		lastWord = word;
	}
	const ruleLine = type == ReformatType.ONELINE ? line : line.trimEnd();
	rules.push({ suggested: "", rule: ruleLine, comment: userComment });
}
