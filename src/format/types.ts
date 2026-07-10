// Shared types for the NLP++ formatter.
//
// IMPORTANT: nothing in src/format/* may import 'vscode'. The formatter engine
// is pure TypeScript so it can be exercised over the whole .nlp corpus with
// plain Node (see corpusTest.ts) without launching an Electron test host.
// Only formatProvider.ts (the thin VSCode adapter) imports 'vscode'.

// Rule reformatting style. Mirrors the historical nlp.ts enum (same order/values)
// so the existing reformat commands keep working when they delegate here.
export enum ReformatType { NORMAL, ONELINE, PARENS }

export enum TokenKind {
	Whitespace,   // spaces and tabs (never contains a newline)
	Newline,      // "\n", "\r\n", or a lone "\r"
	LineComment,  // "#...." up to (but not including) the end of line
	BlockComment, // "/* .... */" (may span lines)
	String,       // "\"....\"" honoring backslash escapes; may be newline-terminated
	Arrow,        // "<-"
	AtAt,         // "@@" rule terminator (NOT a region marker on its own)
	Directive,    // "@RULES", "@POST", "@@CODE", ... a region marker
	Punct,        // a single structural punctuation char: ( ) [ ] { } ; ,
	Word,         // a maximal run of everything else (identifiers, numbers, operators)
}

export interface Token {
	kind: TokenKind;
	text: string;  // exact source substring
	start: number; // byte/char offset into the source
	end: number;   // exclusive
}

// The region-introducing keywords, per the tmLanguage grammar:
//   (@(@)?)(CHECK|CODE|DECL|MULTI|NODES|PATH|POST|PRE|RULES)
// Plus a few that appear in real analyzers. Kept permissive on purpose; an
// unknown "@FOO" is treated as an Other region rather than dropped.
export const REGION_KEYWORDS = [
	"CHECK", "CODE", "DECL", "MULTI", "NODES", "PATH", "POST", "PRE",
	"RULES", "SELECT", "RECURSE", "GROUP", "ARR", "END",
] as const;

export enum RegionKind {
	Preamble, // everything before the first directive (header banner, etc.)
	Code,     // @DECL @CODE @PRE @POST @CHECK  -> C-like imperative code
	Rules,    // @RULES @MULTI @SELECT @RECURSE -> pattern element lists
	Other,    // @PATH @NODES @GROUP @END ... -> passthrough / light normalize
}

export interface Region {
	kind: RegionKind;
	marker: string; // e.g. "@RULES" ("" for Preamble)
	text: string;   // full region text INCLUDING the marker line and trailing newline(s)
	start: number;  // offset of region start in source
	end: number;    // exclusive
}

export interface FormatOptions {
	useTabs: boolean;   // true -> indent with tabs (project default)
	tabSize: number;    // spaces per indent level when useTabs is false; also tab width
	braceAllman: boolean; // true -> opening brace on its own line (project default)
	eol: string;        // "\n" or "\r\n" — inferred from the document
}

export const DEFAULT_OPTIONS: FormatOptions = {
	useTabs: true,
	tabSize: 4,
	braceAllman: true,
	eol: "\n",
};
