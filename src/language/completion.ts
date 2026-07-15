// Pure region-context helper for NLP++ completion.
//
// PURE MODULE: no 'vscode' import. Completion is context-sensitive -- code
// regions (@CODE/@DECL/@PRE/@POST/@CHECK) want functions/keywords, rule regions
// (@RULES/@MULTI/@SELECT/@RECURSE) want rule-element keywords and concepts. This
// reuses the formatter's region splitter to report which region an offset falls
// in, so the VSCode adapter can pick the right suggestion set.

import { splitRegions } from "../format/regions";
import { RegionKind } from "../format/types";

export { RegionKind };

// Which region kind contains `offset`. Defaults to Other for an empty file or an
// offset past the end.
export function regionKindAt(src: string, offset: number): RegionKind {
	const regions = splitRegions(src);
	for (const r of regions) {
		if (offset >= r.start && offset < r.end) return r.kind;
	}
	// Offset at/after the last region end -> attribute it to the last region.
	if (regions.length) return regions[regions.length - 1].kind;
	return RegionKind.Other;
}
