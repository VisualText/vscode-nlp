// Top-level NLP++ document formatter (pure).
//
// Splits a .nlp file into regions and dispatches each to the formatter for its
// sub-language (@RULES/@MULTI -> rules formatter, @DECL/@CODE/@POST/... -> code
// reindenter, everything else passthrough), then reassembles. The same
// per-region function backs both whole-document formatting and range/selection
// formatting, so a selection is formatted identically to a full format.

import { FormatOptions, DEFAULT_OPTIONS, RegionKind, Region } from "./types";
import { splitRegions } from "./regions";
import { formatRulesRegion } from "./rulesRegion";
import { formatCodeRegion } from "./codeRegion";

// Apply a region formatter but only accept the result if it is a fixpoint
// (re-running reproduces it). Otherwise keep the original region text. This is
// what makes the whole document provably idempotent regardless of how gnarly an
// individual region is: every region is emitted as either a fixpoint of its
// formatter or the untouched original, and both are stable under re-formatting.
function safe(fn: (t: string, o: FormatOptions) => string, text: string, opts: FormatOptions): string {
	const once = fn(text, opts);
	const twice = fn(once, opts);
	return once === twice ? once : text;
}

// Format a single region according to its kind. This is the shared unit of
// work: whole-document and range formatting both go through here, so a region
// is formatted the same way no matter how the format was triggered.
function formatRegion(region: Region, opts: FormatOptions): string {
	switch (region.kind) {
		case RegionKind.Rules:
			return safe(formatRulesRegion, region.text, opts);
		case RegionKind.Code:
			return safe(formatCodeRegion, region.text, opts);
		default:
			return region.text; // Preamble / Other: passthrough (lossless)
	}
}

function resolveOptions(src: string, options?: Partial<FormatOptions>): FormatOptions {
	return { ...DEFAULT_OPTIONS, eol: detectEol(src), ...options };
}

// Infer the document's end-of-line style from its content.
export function detectEol(src: string): string {
	const crlf = (src.match(/\r\n/g) || []).length;
	const lf = (src.match(/(?<!\r)\n/g) || []).length;
	return crlf > lf ? "\r\n" : "\n";
}

export function formatDocument(src: string, options?: Partial<FormatOptions>): string {
	const opts = resolveOptions(src, options);
	let out = "";
	for (const region of splitRegions(src)) out += formatRegion(region, opts);
	return out;
}

// A replacement edit expressed in source offsets: replace [start, end) with
// newText. The provider maps these to vscode.TextEdit.
export interface RegionEdit {
	start: number;
	end: number;
	newText: string;
}

// Format every region that overlaps the offset range [rangeStart, rangeEnd) and
// return a replace edit for each one whose text actually changed. Region
// granularity is deliberate: code reindentation depends on whole-region brace
// depth, so formatting only part of a region would be wrong. A zero-length range
// (bare cursor) formats the region containing the caret.
export function formatRegionsInRange(
	src: string,
	rangeStart: number,
	rangeEnd: number,
	options?: Partial<FormatOptions>,
): RegionEdit[] {
	const opts = resolveOptions(src, options);
	const edits: RegionEdit[] = [];
	for (const region of splitRegions(src)) {
		const overlaps = rangeStart === rangeEnd
			? region.start <= rangeStart && rangeStart <= region.end
			: region.start < rangeEnd && region.end > rangeStart;
		if (!overlaps) continue;
		const formatted = formatRegion(region, opts);
		if (formatted !== region.text) {
			edits.push({ start: region.start, end: region.end, newText: formatted });
		}
	}
	return edits;
}
