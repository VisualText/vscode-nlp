// Pure semantic-token classification for NLP++.
//
// PURE MODULE: no 'vscode' import. Layers meaning-based coloring on top of the
// TextMate grammar: an identifier is colored by WHAT it is (built-in function,
// user function, KB concept, rule, node accessor) rather than by lexical shape.
// Classification needs the workspace symbol sets, which the VSCode adapter
// supplies, so this stays testable with plain data.

import { tokenize } from "../format/tokenizer";
import { TokenKind } from "../format/types";

// Maps to a SemanticTokensLegend on the adapter side.
export type SemType = "function" | "method" | "class" | "type" | "macro";

export interface SemToken {
	start: number;
	length: number;
	type: SemType;
}

export interface SymbolSets {
	letters: Set<string>;   // node accessors N/S/X/G/L (case-sensitive) -> macro
	userFuncs: Set<string>; // @DECL functions -> method
	concepts: Set<string>;  // .kbb concepts -> class
	rules: Set<string>;     // rule names -> type
	builtins: Set<string>;  // lowercased built-in names -> function
}

const IDENT = /^_?[A-Za-z][\w]*$/;

// Classify each identifier Word token. Precedence: node accessor, then
// user-declared symbols (a user name shadows a same-named built-in), then
// built-ins. Unknown identifiers are left for the TextMate grammar.
export function classifyTokens(src: string, sets: SymbolSets): SemToken[] {
	const out: SemToken[] = [];
	for (const t of tokenize(src)) {
		if (t.kind !== TokenKind.Word || !IDENT.test(t.text)) continue;
		const w = t.text;
		let type: SemType | undefined;
		if (sets.letters.has(w)) type = "macro";
		else if (sets.userFuncs.has(w)) type = "method";
		else if (sets.concepts.has(w)) type = "class";
		else if (sets.rules.has(w)) type = "type";
		else if (sets.builtins.has(w.toLowerCase())) type = "function";
		if (type) out.push({ start: t.start, length: t.text.length, type });
	}
	return out;
}
