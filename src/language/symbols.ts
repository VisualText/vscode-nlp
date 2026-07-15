// Pure structural outline for NLP++ pass files.
//
// PURE MODULE: no 'vscode' import. Produces an offset-based symbol tree that the
// VSCode adapter (providers.ts) maps to DocumentSymbol/Location. Reuses the
// formatter's region splitter and tokenizer so the outline agrees with how the
// file is actually partitioned.

import { splitRegions } from "../format/regions";
import { RegionKind } from "../format/types";
import { KEYWORD_SET } from "./nlpxxData";

export type NlpSymbolKind = "region" | "rule" | "function";

export interface NlpSymbol {
	name: string;
	detail: string;
	kind: NlpSymbolKind;
	// Offsets into the full source.
	start: number; // full extent (for folding/selection of the whole item)
	end: number;
	selStart: number; // the identifier itself (what gets highlighted on reveal)
	selEnd: number;
	children: NlpSymbol[];
}

// A rule head inside an @RULES region looks like:  _name <- ... @@
// The grammar's meta.expression is  ([_\w]+)\s*(\[[^\]]*\])*\s*(<-).
// We take the identifier immediately before each "<-" as the rule name and let
// the rule extent run to the next "@@" terminator (or the region end).
const RULE_HEAD = /([_\w]+)\s*(?:\[[^\]]*\])*\s*<-/g;

// A user function/declaration inside @DECL/@CODE, C-style:  name( ... ) {
// Heuristic and deliberately conservative -- only matches an identifier followed
// by a parenthesized arg list and an opening brace, at the start of a line.
const FUNC_DECL = /(^|\n)[ \t]*([A-Za-z_][\w]*)\s*\([^;{}]*\)\s*\{/g;

function scanRules(text: string, base: number): NlpSymbol[] {
	const out: NlpSymbol[] = [];
	RULE_HEAD.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = RULE_HEAD.exec(text)) !== null) {
		const name = m[1];
		const nameOffsetInMatch = m[0].indexOf(name);
		const selStart = base + m.index + nameOffsetInMatch;
		// Extent: from the name to the next "@@" (rule terminator) after it.
		const termIdx = text.indexOf("@@", m.index);
		const end = base + (termIdx >= 0 ? termIdx + 2 : text.length);
		out.push({
			name,
			detail: "rule",
			kind: "rule",
			start: selStart,
			end,
			selStart,
			selEnd: selStart + name.length,
			children: [],
		});
	}
	return out;
}

function scanFunctions(text: string, base: number): NlpSymbol[] {
	const out: NlpSymbol[] = [];
	FUNC_DECL.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = FUNC_DECL.exec(text)) !== null) {
		const name = m[2];
		// "if (...) {" / "while (...) {" are control flow, not declarations.
		if (KEYWORD_SET.has(name.toLowerCase())) continue;
		const selStart = base + m.index + m[0].indexOf(name);
		out.push({
			name,
			detail: "function",
			kind: "function",
			start: selStart,
			end: base + FUNC_DECL.lastIndex,
			selStart,
			selEnd: selStart + name.length,
			children: [],
		});
	}
	return out;
}

// Build the top-level outline: one node per region, with rules/functions nested.
export function analyzeSymbols(src: string): NlpSymbol[] {
	const regions = splitRegions(src);
	const out: NlpSymbol[] = [];

	for (const r of regions) {
		if (r.kind === RegionKind.Preamble) continue; // header banner, not a symbol
		// "@@DECL"/"@@CODE"/... are closing terminators, not their own sections.
		if (r.marker.startsWith("@@")) continue;
		const marker = r.marker || "(region)";
		const node: NlpSymbol = {
			name: marker,
			detail: "",
			kind: "region",
			start: r.start,
			end: r.end,
			selStart: r.start,
			selEnd: r.start + marker.length,
			children: [],
		};

		if (r.kind === RegionKind.Rules) {
			node.children = scanRules(r.text, r.start);
		} else if (r.kind === RegionKind.Code) {
			node.children = scanFunctions(r.text, r.start);
		}
		node.detail = node.children.length
			? `${node.children.length} ${r.kind === RegionKind.Rules ? "rules" : "items"}`
			: "";
		out.push(node);
	}

	return out;
}

// Flatten the tree to a lookup list of declared names (rules + functions) for
// same-file go-to-definition.
export function declaredSymbols(src: string): NlpSymbol[] {
	const flat: NlpSymbol[] = [];
	const walk = (nodes: NlpSymbol[]) => {
		for (const n of nodes) {
			if (n.kind !== "region") flat.push(n);
			walk(n.children);
		}
	};
	walk(analyzeSymbols(src));
	return flat;
}
