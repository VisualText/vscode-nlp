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
		// A generous, invisible hit rectangle makes the whole label easy to click
		// (the text glyphs alone are a tiny target). Width scales with the label
		// but is capped so adjacent nodes don't overlap and steal each other's
		// clicks; height spans the row.
		const hitW = Math.min(84, Math.max(30, n.label.length * 8 + 16));
		const hit =
			`<rect class="hit" x="${(n.x - hitW / 2).toFixed(1)}" y="${n.y - 2}" ` +
			`width="${hitW}" height="${LINK_BOTTOM + 8}" rx="3"/>`;
		// A collapsed node gets a marker hinting at hidden children.
		const marker = n.collapsed
			? `<circle class="marker" cx="${n.x}" cy="${n.y + LINK_BOTTOM + 3}" r="5"/>`
			: "";
		labels.push(
			`<g class="${cls}" data-id="${n.id}" data-start="${n.start}" data-end="${n.end}" data-haskids="${n.hasKids ? 1 : 0}">` +
			hit +
			`<text x="${n.x}" y="${n.y + TEXT_DY}" text-anchor="middle">${esc(n.label)}</text>` +
			marker +
			`</g>`,
		);
	}

	// The <svg> fills its container (width/height 100%) and the full tree size is
	// carried in data-w/data-h for fit-to-window. We deliberately do NOT set an
	// intrinsic pixel width/height equal to the tree: a very wide tree (tens of
	// thousands of px) would exceed the compositor's max texture size and render
	// as black tiles. Zoom/pan is applied via the #viewport transform, and content
	// outside the viewport is clipped (SVG overflow is hidden by default).
	return (
		`<svg id="tree" width="100%" height="100%" ` +
		`data-w="${layout.width}" data-h="${layout.height}" xmlns="http://www.w3.org/2000/svg">` +
		`<g id="viewport">${links.join("")}${labels.join("")}</g>` +
		`</svg>`
	);
}
