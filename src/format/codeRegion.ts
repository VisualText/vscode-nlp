// Code-region reindenter (pure) for @DECL / @CODE / @PRE / @POST / @CHECK.
//
// NLP++ code regions are C-like: brace-nested blocks, `;`-terminated statements,
// and if/else/while control flow (often with a single unbraced body on the next
// line). This reindenter fixes indentation structurally and enforces Allman
// braces, WITHOUT touching intra-line spacing (rewriting expression spacing over
// 11k files is both risky and unwanted). Concretely it:
//   - indents one tab (or tabSize spaces) per brace-nesting level,
//   - dedents lines that begin with `}`,
//   - moves a trailing `{` onto its own line (Allman),
//   - indents a braceless if/else/while body one extra level.
// Brace/`;` detection runs off the tokenizer, so braces inside strings or
// comments never affect depth. The reindenter is idempotent by construction; the
// caller additionally wraps it in a fixpoint safety valve.

import { Token, TokenKind, FormatOptions } from "./types";
import { tokenize } from "./tokenizer";

// Tokens that carry no structural meaning for indentation.
function isTrivial(t: Token): boolean {
	return t.kind === TokenKind.Whitespace || t.kind === TokenKind.Newline;
}

const CONTROL = new Set(["if", "else", "while"]);

interface Line {
	text: string;      // full source text of the line (no trailing newline)
	nonTrivial: Token[]; // structural tokens (no whitespace/newline)
}

// Split the region's tokens into logical lines on Newline tokens. A block
// comment with embedded newlines stays within one logical line (its newlines
// live inside the token text, not as Newline tokens) and is therefore never
// re-indented internally.
function toLines(tokens: Token[]): Line[] {
	const lines: Line[] = [];
	let text = "";
	let nonTrivial: Token[] = [];
	for (const t of tokens) {
		if (t.kind === TokenKind.Newline) {
			lines.push({ text, nonTrivial });
			text = "";
			nonTrivial = [];
			continue;
		}
		text += t.text;
		if (!isTrivial(t)) nonTrivial.push(t);
	}
	lines.push({ text, nonTrivial }); // trailing line (may be empty)
	return lines;
}

function indentString(level: number, opts: FormatOptions): string {
	if (level <= 0) return "";
	return opts.useTabs ? "\t".repeat(level) : " ".repeat(level * opts.tabSize);
}

function isBrace(t: Token, ch: "{" | "}"): boolean {
	return t.kind === TokenKind.Punct && t.text === ch;
}

export function formatCodeRegion(regionText: string, opts: FormatOptions): string {
	const eol = opts.eol;
	const lines = toLines(tokenize(regionText));
	const out: string[] = [];

	let depth = 0;
	let pendingBody = false; // previous line was a braceless control header

	for (const line of lines) {
		const nt = line.nonTrivial;

		// Blank line: emit empty, keep any pending-body state.
		if (nt.length === 0) {
			out.push("");
			continue;
		}

		// Count leading '}' so a line that starts by closing blocks dedents.
		let lead = 0;
		while (lead < nt.length && isBrace(nt[lead], "}")) lead++;
		const base = Math.max(0, depth - lead);

		// A braceless control body indents one extra level, unless the body is
		// itself a brace block (the '{' already carries the indent via depth).
		let extra = 0;
		if (pendingBody) {
			extra = isBrace(nt[0], "{") ? 0 : 1;
			pendingBody = false;
		}
		const level = base + extra;

		// Emit, splitting a trailing '{' onto its own line (Allman).
		const content = line.text.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
		const last = nt[nt.length - 1];
		if (opts.braceAllman && isBrace(last, "{") && nt.length > 1 && content.endsWith("{")) {
			const head = content.slice(0, -1).replace(/[ \t]+$/, "");
			out.push(indentString(level, opts) + head);
			out.push(indentString(level, opts) + "{");
		} else {
			out.push(indentString(level, opts) + content);
		}

		// Update brace depth over the whole line.
		for (const t of nt) {
			if (isBrace(t, "{")) depth++;
			else if (isBrace(t, "}")) depth = Math.max(0, depth - 1);
		}

		// Decide whether this line is a braceless control header awaiting a body
		// on the following line: starts with if/else/while, opens no brace, and
		// isn't an inline single statement (doesn't end in ';').
		const first = nt[0];
		const opensBrace = nt.some((t) => isBrace(t, "{"));
		const endsSemi = last.kind === TokenKind.Punct && last.text === ";";
		const firstIsControl = first.kind === TokenKind.Word && CONTROL.has(first.text);
		if (firstIsControl && !opensBrace && !endsSemi) pendingBody = true;
	}

	return out.join(eol);
}
