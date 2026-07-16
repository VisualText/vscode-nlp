// Pure SVG renderer for a laid-out parse tree.
//
// PURE MODULE: no 'vscode' import. Turns a LayoutResult into SVG markup: one
// <line class="link"> per parent→child edge (drawn first, so they sit behind
// text) and one <g class="node"> per node carrying data-start/data-end for
// click-to-reveal. Colors/fonts are left to the host stylesheet (CSS classes),
// so the same markup themes correctly in light and dark VS Code.

import { LayoutResult, LayoutNode, flatten } from "./layout";

function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const TEXT_DY = 16; // baseline offset from the row top
const LINK_TOP = 4;
const LINK_BOTTOM = 22;

export function renderTreeSvg(layout: LayoutResult): string {
	const nodes = flatten(layout.root);
	const links: string[] = [];
	const labels: string[] = [];

	for (const n of nodes) {
		for (const c of n.children) {
			links.push(
				`<line class="link" x1="${n.x}" y1="${n.y + LINK_BOTTOM}" x2="${c.x}" y2="${c.y + LINK_TOP}"/>`,
			);
		}
	}

	for (const n of nodes) {
		const leaf = n.children.length === 0;
		const cls = leaf ? "node leaf" : "node internal";
		labels.push(
			`<g class="${cls}" data-start="${n.start}" data-end="${n.end}">` +
			`<text x="${n.x}" y="${n.y + TEXT_DY}" text-anchor="middle">${esc(n.label)}</text>` +
			`</g>`,
		);
	}

	return (
		`<svg id="tree" width="${layout.width}" height="${layout.height}" ` +
		`viewBox="0 0 ${layout.width} ${layout.height}" xmlns="http://www.w3.org/2000/svg">` +
		`<g id="viewport">${links.join("")}${labels.join("")}</g>` +
		`</svg>`
	);
}
