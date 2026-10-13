// Renamed TextMate scopes, and the migration of color rules keyed to the old ones (#107).
//
// PURE MODULE: no 'vscode' import. The grammars (grammars/, VisualText/nlpplus-tmbundle)
// used to name scopes for the color they got rather than for what they are, and
// colorizeAnalyzer() copied textMateRules for those names into every analyzer
// workspace's .vscode/settings.json. The grammars now use standard names; this
// rewrites old rules so they keep coloring exactly what they colored before.
//
// An old name can map to several new ones: "comment.line.dict" was the dictionary
// headword AND the line comment of .kb, .kbb and .tree files, so a rule for it
// becomes a rule for all of their new names.

export const RENAMED_SCOPES: Record<string, string[]> = {
	"keyword.region.nlp": ["keyword.control.directive.region.nlp"],
	"keyword.constants.nlp": ["constant.language.nlp"],
	"keyword.attribute.nlp": ["entity.other.attribute-name.nlp"],
	"keyword.equals.nlp": ["keyword.operator.assignment.nlp"],
	"variable.rewrite.nlp": ["entity.name.type.rewrite.nlp"],
	"variable.rewrite-symbol.nlp": ["meta.attribute.rewrite.nlp"],
	"literal.nlp": ["meta.literal.nlp"],
	"literal.seq": ["meta.literal.seq"],
	"literal.tree": ["meta.literal.tree"],
	"constant.character.escape": ["constant.character.escape.nlp"],
	"punctuation.paren.open": ["punctuation.paren.open.nlp"],
	"punctuation.paren.close": ["punctuation.paren.close.nlp"],
	"punctuation.square.open": ["punctuation.square.open.nlp"],
	"punctuation.square.close": ["punctuation.square.close.nlp"],
	"string.double.nlp": ["string.quoted.double.nlp"],
	"string.double.dict": ["string.quoted.double.dict"],
	"string.double.kb": ["string.quoted.double.kb"],
	"string.double.kbb": ["string.quoted.double.kbb"],
	"string.double.seq": ["string.quoted.double.seq"],
	"string.double.tree": ["string.quoted.double.tree"],
	"keyword.rewrite.tree": ["entity.name.type.tree"],
	"keyword.node.tree": ["string.unquoted.token.tree"],
	"keyword.attribute.tree": ["storage.type.tree"],
	"keyword.fired.tree": ["keyword.other.fired.tree"],
	"keyword.other.kbb": ["entity.name.type.level0.kbb"],
	"keyword.concept.kbb": ["entity.name.type.level1.kbb"],
	"keyword.concept.kbb1": ["entity.name.type.level2.kbb"],
	"keyword.concept.kbb2": ["entity.name.type.level3.kbb"],
	"comment.line.dict": ["entity.name.tag.dict", "comment.line.dict", "comment.line.kb", "comment.line.kbb", "comment.line.tree"],
	"entity.nothing.dict": ["meta.whitespace.dict"],
	"keyword.region.dict": ["support.type.property-name.dict", "meta.whitespace.dict"],
	"entity.name.function.dict": ["string.unquoted.value.dict"],
	"constant.numeric.tree": ["constant.numeric.tree", "constant.numeric.kbb"],
	"meta.expression.tree": ["meta.expression.tree", "meta.expression.txxt"],
	"variable.parameter.nlp": ["variable.parameter.nlp", "keyword.control.kb"],
};

// A textMateRules "scope" is a string, a comma-separated selector list, or an array.
// Returns the migrated scope and whether anything changed. Selectors this does not
// recognize (descendant selectors, other languages) are kept as they are.
export function migrateScope(scope: string | string[]): { scope: string | string[]; changed: boolean } {
	const list = Array.isArray(scope) ? scope : scope.split(",").map((s) => s.trim()).filter((s) => s.length);
	const out: string[] = [];
	let changed = false;
	for (const s of list) {
		const renamed = RENAMED_SCOPES[s];
		if (renamed) changed = true;
		for (const n of renamed ?? [s]) if (!out.includes(n)) out.push(n);
	}
	if (!changed) return { scope, changed: false };
	return { scope: out.length === 1 ? out[0] : out, changed: true };
}

// Rewrite every textMateRules scope in a settings object, in place: the top-level
// editor.tokenColorCustomizations block and its per-theme "[Theme]" blocks.
// Returns true when something changed.
export function migrateTokenColors(settings: Record<string, unknown>): boolean {
	const block = settings["editor.tokenColorCustomizations"];
	if (!block || typeof block !== "object") return false;
	let changed = false;
	const fixRules = (holder: unknown) => {
		const rules = (holder as { textMateRules?: unknown })?.textMateRules;
		if (!Array.isArray(rules)) return;
		for (const rule of rules) {
			if (!rule || typeof rule !== "object" || !("scope" in rule)) continue;
			const r = rule as { scope: string | string[] };
			const m = migrateScope(r.scope);
			if (m.changed) {
				r.scope = m.scope;
				changed = true;
			}
		}
	};
	fixRules(block);
	for (const [key, value] of Object.entries(block as Record<string, unknown>)) {
		if (key.startsWith("[")) fixRules(value);
	}
	return changed;
}
