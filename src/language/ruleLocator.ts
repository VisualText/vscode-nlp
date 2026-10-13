// Pure rule/element locator for NLP++ pass files (#787).
//
// PURE MODULE: no 'vscode' import. Given a pass file's text, answers "which rule,
// and which element of it, is at this offset?" so a Find result can say
// "pass 12, rule 3, element 4" the way the analyzer itself counts them.
//
// Rule numbers match the engine's G("$rulenum"): Ifile::intern collects every
// @RULES region of the file into one list and Irule::renumber numbers it from 1.
// Rules inside a @RECURSE mini-pass belong to that mini-pass's own list, so they
// get no number here. Element numbers are 1-based positions after "<-", the
// same numbering N(n) and @PRE <n,n> use. The suggested element is element 0.

import { tokenize } from "../format/tokenizer";
import { TokenKind } from "../format/types";

export interface RuleSpot {
	rule: number; // 1-based rule number within the pass file
	elt: number;  // 1-based element number; 0 = suggested element; -1 = between elements
}

interface RuleSpan {
	start: number;    // start of the suggested element
	end: number;      // end of the closing "@@"
	rule: number;
	elts: { start: number; end: number }[]; // elts[0] is the suggested element
}

export class RuleLocator {
	private spans: RuleSpan[] = [];

	constructor(src: string) {
		const tokens = tokenize(src);
		let inRules = false;
		let recurse = 0;
		let num = 0;
		let cur: RuleSpan | undefined;
		let depth = 0; // [ ] / ( ) nesting inside a rule
		let sawArrow = false;

		const close = (end: number) => {
			if (cur && sawArrow) {
				cur.end = end;
				if (!recurse) {
					cur.rule = ++num;
					this.spans.push(cur);
				}
			}
			cur = undefined;
			sawArrow = false;
			depth = 0;
		};

		for (const t of tokens) {
			if (t.kind === TokenKind.Directive) {
				close(t.start);
				const kw = t.text.replace(/^@+/, "").toUpperCase();
				const closing = t.text.startsWith("@@");
				if (kw === "RECURSE") recurse = Math.max(0, recurse + (closing ? -1 : 1));
				inRules = kw === "RULES" && !closing;
				continue;
			}
			if (!inRules) continue;
			if (t.kind === TokenKind.AtAt) {
				close(t.end);
				continue;
			}
			if (t.kind === TokenKind.Arrow) {
				if (cur && depth === 0) sawArrow = true;
				continue;
			}
			if (t.kind === TokenKind.Punct) {
				if (t.text === "[" || t.text === "(") depth++;
				else if ((t.text === "]" || t.text === ")") && depth > 0) depth--;
				if (cur && cur.elts.length) cur.elts[cur.elts.length - 1].end = t.end;
				continue;
			}
			if (t.kind !== TokenKind.Word && t.kind !== TokenKind.String) continue;
			if (!cur) {
				cur = { start: t.start, end: t.end, rule: 0, elts: [] };
			}
			if (depth === 0 && (sawArrow || !cur.elts.length)) {
				cur.elts.push({ start: t.start, end: t.end });
			} else if (cur.elts.length) {
				cur.elts[cur.elts.length - 1].end = t.end;
			}
		}
		close(src.length);
	}

	// Rule count, as the engine numbers them.
	get ruleCount(): number {
		return this.spans.length;
	}

	at(offset: number): RuleSpot | undefined {
		// Binary search: spans are in source order and never overlap.
		let lo = 0, hi = this.spans.length - 1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			const s = this.spans[mid];
			if (offset < s.start) hi = mid - 1;
			else if (offset >= s.end) lo = mid + 1;
			else {
				const elt = s.elts.findIndex((e) => offset >= e.start && offset < e.end);
				return { rule: s.rule, elt };
			}
		}
		return undefined;
	}
}

// 1-based visual column of character index `pos` in `line`, expanding tabs to
// tab stops the way the editor's "Col" does.
export function visualColumn(line: string, pos: number, tabSize: number): number {
	let col = 0;
	const stop = Math.min(pos, line.length);
	for (let i = 0; i < stop; i++) {
		col = line[i] === "\t" ? col + tabSize - (col % tabSize) : col + 1;
	}
	return col + 1;
}
