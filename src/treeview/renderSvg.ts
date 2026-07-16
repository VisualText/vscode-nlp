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
		const cls = "node" +
			(n.hasKids ? " internal" : " leaf") +
			(n.collapsed ? " collapsed" : "");
		// A collapsed node gets a marker dot hinting at hidden children.
		const marker = n.collapsed
			? `<circle class="marker" cx="${n.x}" cy="${n.y + LINK_BOTTOM + 2}" r="3"/>`
			: "";
		labels.push(
			`<g class="${cls}" data-id="${n.id}" data-start="${n.start}" data-end="${n.end}" data-haskids="${n.hasKids ? 1 : 0}">` +
			`<text x="${n.x}" y="${n.y + TEXT_DY}" text-anchor="middle">${esc(n.label)}</text>` +
			marker +
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
