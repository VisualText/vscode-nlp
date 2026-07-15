// Static language data for NLP++ (built-in functions, keywords, region markers).
//
// PURE MODULE: must not import 'vscode' -- it feeds both the pure analysis layers
// (diagnostics/symbols) and the thin VSCode providers. The built-in lists are
// transcribed from syntaxes/nlp.tmLanguage.json so hover/completion/diagnostics
// agree with what the colorizer already recognizes. Keep this in sync with the
// grammar when either changes.

// Region-introducing directives. "@" or "@@" prefix, matched at line start.
export const REGION_MARKERS: Record<string, string> = {
	DECL: "Function & variable declarations for this pass.",
	CODE: "Imperative NLP++ code run once for the pass.",
	PRE: "Code run before the pass rules are applied.",
	POST: "Code run after the pass rules are applied.",
	CHECK: "Post-match check code that can fail a rule.",
	RULES: "Pattern rules matched against the parse tree.",
	MULTI: "Rules where every match fires (multi-pass).",
	SELECT: "Rules where the best/longest match is selected.",
	RECURSE: "Rules applied recursively over the region.",
	NODES: "Node list declaration.",
	PATH: "Context @PATH constraint for the rules below.",
	GROUP: "Grouping directive.",
};

// Control-flow / statement keywords (grammar: keyword.other.nlp).
export const KEYWORDS = [
	"cap", "cout", "else", "gp", "group", "if", "inc", "return", "while",
];

// Rule-element modifiers inside @RULES (grammar: keyword.attribute.nlp).
export const RULE_KEYWORDS = [
	"attr", "attrs", "da", "deacc", "deaccent", "except", "excepts", "fail",
	"fails", "gp", "group", "layer", "layers", "look", "lookahead", "match",
	"matches", "max", "min", "nest", "o", "one", "opt", "option", "optional",
	"pass", "passes", "plus", "recurse", "ren", "rename", "s", "singlet",
	"star", "t", "tree", "trig", "trigger", "unsealed",
];

// Node-accessor letter functions (grammar: entity.name.function.letter.nlp).
export const LETTER_FUNCTIONS: Record<string, string> = {
	N: 'N("attr") — numeric attribute value of the matched node.',
	S: 'S("attr") — string attribute value of the matched node.',
	X: 'X("attr") — value from the single (X) node.',
	G: 'G("var") — global variable value.',
	L: 'L("var") — local variable value.',
};

// Built-in functions (grammar: entity.name.function.nlp). Transcribed verbatim.
export const BUILTIN_FUNCTIONS: string[] = [
	"addarg", "addattr", "addcnode", "addconcept", "addconval", "addnode",
	"addnumval", "addstmt", "addstrs", "addstrval", "addsval", "addword",
	"arraylength", "attrchange", "attrexists", "attrname", "attrtype",
	"attrvals", "attrwithval", "batchstart", "cap", "cbuf", "closefile",
	"conceptname", "conceptpath", "conval", "cout", "coutreset", "dballocstmt",
	"dbbindcol", "dbclose", "dbexec", "dbexecstmt", "dbfetch", "dbfreestmt",
	"dbopen", "deaccent", "debug", "dictfindword", "dictfirst", "dictgetword",
	"dictnext", "down", "else", "eltnode", "excise", "exitpass", "exittopopup",
	"factorial", "fail", "fileout", "findana", "findattr", "findattrs",
	"findconcept", "findhierconcept", "findnode", "findphrase", "findroot",
	"findvals", "findwordpath", "firstnode", "flt", "fltval", "fncallstart",
	"fprintgvar", "fprintnvar", "fprintxvar", "fprintvar", "gdump", "getconcept",
	"getconval", "getnumval", "getpopupdata", "getstrval", "getsval", "ginc",
	"gp", "group", "gtolower", "guniq", "hitconf", "if", "inc", "inheritval",
	"inputrange", "inputrangetofile", "interactive", "kbdumptree", "lasteltnode",
	"lastnode", "length", "lengthr", "levenshtein", "lextagger", "listadd",
	"listnode", "LJ", "lj", "logten", "lookup", "lowercase", "makeconcept",
	"makeparentconcept", "makephrase", "makestmt", "merge", "merger", "mkdir",
	"movecleft", "movecright", "movesem", "ndump", "next", "nextattr", "nextval",
	"ninc", "nodeconcept", "nodeowner", "noop", "num", "numrange", "numval",
	"openfile", "or", "pathconcept", "percentstr", "permuten", "phraselength",
	"phraseraw", "phrasetext", "pncopyvars", "pndown", "pninsert", "pnmakevar",
	"pnname", "pnnext", "pnprev", "pnreplaceval", "pnroot", "pnsingletdown",
	"pnup", "pnvar", "pnvarnames", "pranchor", "prchild", "preaction",
	"printvar", "pndeletechilds", "pnrename", "prev", "print", "printr", "prlit",
	"prrange", "prtree", "prunephrases", "prxtree", "regexp", "regexpi",
	"renameattr", "renamechild", "renameconcept", "renamenode", "replaceval",
	"resolveurl", "return", "returnstmt", "rfaaction", "rfaactions", "rfaarg",
	"rfaargtolist", "rfacode", "rfaelement", "rfaelt", "rfaexpr", "rfalist",
	"rfalitelt", "rfalittoaction", "rfalittopair", "rfaname", "rfanodes",
	"rfanonlit", "rfanonlitelt", "rfanum", "rfaop", "rfapair", "rfapairs",
	"rfapostunary", "rfapres", "rfarange", "rfarecurse", "rfarecurses",
	"rfaregion", "rfaregions", "rfarule", "rfarulelts", "rfarulemark",
	"rfarules", "rfarulesfile", "rfaselect", "rfastr", "rfasugg", "rfaunary",
	"rfavar", "rfbarg", "rfbdecl", "rfbdecls", "rightjustifynum", "rmattr",
	"rmattrs", "rmattrval", "rmchild", "rmchildren", "rmconcept", "rmcphrase",
	"rmnode", "rmphrase", "rmval", "rmvals", "rmword", "sdump", "setbase",
	"setlookahead", "setunsealed", "single", "singler", "singlex", "singlezap",
	"sortconsbyattr", "sortchilds", "sorthier", "sortphrase", "sortvals",
	"spellcandidates", "spellcorrect", "spellword", "splice", "split", "sqlstr",
	"startout", "stem", "stopout", "str", "strchar", "strchr", "strchrcount",
	"strclean", "strcontains", "strcontainsnocase", "strendswith", "strequal",
	"strequalnocase", "strescape", "strunescape", "strgreaterthan", "strisalpha",
	"strisdigit", "strislower", "strisupper", "strlength", "strlessthan",
	"strnotequal", "strnotequalnocase", "strpiece", "strrchr",
	"strspellcandidate", "strspellcompare", "strstartswith", "strsubst",
	"strtolower", "strtotitle", "strtoupper", "strtrim", "strval", "strwrap",
	"succeed", "suffix", "system", "take", "today", "topdir", "unknown",
	"unpackdirs", "up", "uppercase", "urlbase", "urltofile", "var", "vareq",
	"varfn", "varfnarray", "varinlist", "varne", "varstrs", "varz", "wninit",
	"wnsensestoconcept", "wnhypnymstoconcept", "while", "whilestmt", "wordindex",
	"wordpath", "writekb", "xaddlen", "xaddnvar", "xdump", "xinc", "xmlstr",
	"xrename",
];

export const BUILTIN_SET = new Set(BUILTIN_FUNCTIONS.map((f) => f.toLowerCase()));
export const KEYWORD_SET = new Set(KEYWORDS.map((k) => k.toLowerCase()));
