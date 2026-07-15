// Pure extractor for concept declarations in NLP++ .kbb knowledge-base files.
//
// PURE MODULE: no 'vscode' import. A .kbb file is an indented hierarchy of
// concept names; per the tmLanguage grammar a concept is the leading token on a
// line (at any indent), optionally ending in ':' or followed by an "[attr=...]"
// block. Attribute lines contain '=' and are NOT concepts. This is a heuristic
// scanner (there is no full .kbb parser in the extension) tuned for near-zero
// false positives so go-to-definition/references can target concept lines.

export interface KbConcept {
	name: string;
	start: number; // offset of the concept token (after indent)
	end: number;   // exclusive
}

export function parseKbConcepts(text: string): KbConcept[] {
	const out: KbConcept[] = [];
	let lineStart = 0;

	for (const rawLine of text.split("\n")) {
		const line = rawLine.replace(/\r$/, "");
		const indentLen = line.length - line.trimStart().length;
		const content = line.slice(indentLen);

		// Skip blanks, comments, and attribute blocks ("[attr=...]").
		if (content.length && content[0] !== "#" && content[0] !== "[") {
			// The concept token runs up to the first '[' or ':' (attr block / label).
			let cut = content.length;
			for (let i = 0; i < content.length; i++) {
				if (content[i] === "[" || content[i] === ":") { cut = i; break; }
			}
			const token = content.slice(0, cut).trimEnd();

			// Attribute assignments ("n=3") and pure numbers are not concepts.
			const isAssignment = token.indexOf("=") >= 0;
			const isNumber = /^\d+$/.test(token);
			if (token.length && !isAssignment && !isNumber) {
				const start = lineStart + indentLen;
				out.push({ name: token, start, end: start + token.length });
			}
		}

		lineStart += rawLine.length + 1; // +1 for the "\n" removed by split
	}

	return out;
}
