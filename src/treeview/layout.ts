// Pure tidy-tree layout for linguistic parse trees.
//
// PURE MODULE: no 'vscode' import. Assigns pixel (x, y) to every node using the
// classic naive tidy-tree rule: leaves are spread left-to-right in traversal
// order, and each internal node is centered over its children. Because leaf
// x-ranges of sibling subtrees are disjoint and ordered, no two nodes overlap
// horizontally within a row — good enough for parse trees and ~20 lines, with no
// d3 dependency. (A full Reingold–Tilford contour pass would tighten deep,
// lopsided trees; not needed for a first version.)

import { TreeNode } from "./parseTree";

export interface LayoutNode {
	id: number;
	label: string;
	type: string;
	start: number;
	end: number;
	x: number; // pixel center
	y: number; // pixel top of the row
	hasKids: boolean;   // node has children in the source tree
	collapsed: boolean; // children are currently hidden
	children: LayoutNode[];
}

export interface LayoutResult {
	root: LayoutNode;
	width: number;
	height: number;
	colWidth: number; // effective horizontal spacing (for sizing hit areas)
}

export interface LayoutOptions {
	colWidth?: number;  // horizontal spacing between adjacent leaves
	rowHeight?: number; // vertical spacing between depths
	margin?: number;    // padding around the drawing
	stagger?: number;   // vertical offset per stagger row (0 = off); avoids label overlap
	charWidth?: number; // approx px per character, for estimating label width
	labelGap?: number;  // minimum horizontal gap required between two labels
	maxStaggerRows?: number; // cap on stagger depth before accepting slight overlap
	isCollapsed?: (id: number) => boolean; // hide this node's subtree
}

// Estimated on-screen half-width of a label (SVG text metrics aren't available
// pre-render, so approximate from character count).
function halfWidth(label: string, charWidth: number, pad: number): number {
	return (label.length * charWidth + pad) / 2;
}

// Assign each node in one depth level a stagger "row" so that labels on the same
// level never overlap. Nodes are processed left-to-right and placed on the lowest
// row whose last label ends far enough to the left (greedy lane packing = minimum
// rows). When nothing overlaps, every node lands on row 0 (a straight line).
// Returns a row index per node (by identity) and the number of rows used.
function assignStaggerRows(nodes: LayoutNode[], charWidth: number, labelGap: number, maxRows: number): { rowOf: Map<LayoutNode, number>; rows: number } {
	const rowOf = new Map<LayoutNode, number>();
	const sorted = [...nodes].sort((a, b) => a.x - b.x);
	const rowRight: number[] = []; // right edge of the last label placed on each row
	let maxRow = 0;
	for (const n of sorted) {
		const hw = halfWidth(n.label, charWidth, 8);
		const left = n.x - hw;
		const right = n.x + hw;
		let row = -1;
		for (let r = 0; r < rowRight.length; r++) {
			if (left >= rowRight[r] + labelGap) { row = r; break; } // fits on this row
		}
		if (row === -1) {
			if (rowRight.length < maxRows) {
				row = rowRight.length; // open a new row
				rowRight.push(right);
			} else {
				// Out of rows: use the one whose last label ends soonest (least overlap).
				row = 0;
				for (let r = 1; r < rowRight.length; r++) if (rowRight[r] < rowRight[row]) row = r;
				rowRight[row] = Math.max(rowRight[row], right);
			}
		} else {
			rowRight[row] = right;
		}
		rowOf.set(n, row);
		if (row > maxRow) maxRow = row;
	}
	return { rowOf, rows: maxRow + 1 };
}

export function layoutTree(root: TreeNode, opts: LayoutOptions = {}): LayoutResult {
	const colWidth = opts.colWidth ?? 90;
	const rowHeight = opts.rowHeight ?? 64;
	const margin = opts.margin ?? 24;
	const stagger = opts.stagger ?? 22;
	const charWidth = opts.charWidth ?? 7.5;
	const labelGap = opts.labelGap ?? 4;
	const maxStaggerRows = opts.maxStaggerRows ?? 4;
	const isCollapsed = opts.isCollapsed ?? (() => false);

	let nextLeaf = 0;
	let maxDepth = 0;
	const byDepth: LayoutNode[][] = []; // nodes grouped by tree depth (y is set later)

	const place = (node: TreeNode, depth: number): LayoutNode => {
		if (depth > maxDepth) maxDepth = depth;
		const hasKids = node.children.length > 0;
		const collapsed = hasKids && isCollapsed(node.id);
		// A collapsed node is drawn as a leaf; its subtree is not laid out.
		const children = collapsed ? [] : node.children.map((c) => place(c, depth + 1));
		let x: number;
		if (children.length === 0) {
			x = margin + nextLeaf * colWidth; // leaf/collapsed: spread left-to-right
			nextLeaf++;
		} else {
			x = (children[0].x + children[children.length - 1].x) / 2;
		}
		const laidNode: LayoutNode = {
			id: node.id, label: node.label, type: node.type, start: node.start, end: node.end,
			x, y: 0, hasKids, collapsed, children,
		};
		(byDepth[depth] ??= []).push(laidNode);
		return laidNode;
	};

	const laid = place(root, 0);

	// Vertical placement: each depth is staggered independently so overlapping
	// labels (at ANY level — parts of speech, phrases, words) split into rows, and
	// each level's vertical band expands only by the rows it actually needs. Levels
	// with no collisions stay on a single line.
	let top = margin;
	for (let d = 0; d <= maxDepth; d++) {
		const nodes = byDepth[d] ?? [];
		const { rowOf, rows } = stagger > 0
			? assignStaggerRows(nodes, charWidth, labelGap, maxStaggerRows)
			: { rowOf: new Map<LayoutNode, number>(), rows: 1 };
		for (const n of nodes) n.y = top + (rowOf.get(n) ?? 0) * stagger;
		top += rowHeight + (rows - 1) * stagger; // advance the baseline for the next level
	}

	const leaves = Math.max(1, nextLeaf);
	return {
		root: laid,
		width: margin * 2 + (leaves - 1) * colWidth + colWidth, // room for last label
		height: top + margin,
		colWidth,
	};
}

// Flatten to a node list (used by the renderer / tests).
export function flatten(node: LayoutNode, out: LayoutNode[] = []): LayoutNode[] {
	out.push(node);
	for (const c of node.children) flatten(c, out);
	return out;
}

export function countNodes(n: TreeNode): number {
	return 1 + n.children.reduce((s, c) => s + countNodes(c), 0);
}

export function findNode(root: TreeNode, id: number): TreeNode | undefined {
	if (root.id === id) return root;
	for (const c of root.children) {
		const f = findNode(c, id);
		if (f) return f;
	}
	return undefined;
}

// Ids in the subtree rooted at `node`. With internalOnly, only nodes that have
// children (i.e. the collapsible ones). Used by expand-all / collapse-all.
export function subtreeIds(node: TreeNode, internalOnly = false, out: number[] = []): number[] {
	if (!internalOnly || node.children.length) out.push(node.id);
	for (const c of node.children) subtreeIds(c, internalOnly, out);
	return out;
}

// The set of node ids collapsed when the view first opens. With openDepth = 1
// only the root is expanded, so its children show as collapsed markers and the
// user drills in one node at a time. A node with more than `maxFanout` children
// is also collapsed regardless of depth, so a very wide node (e.g. the flat
// tokenizer row of hundreds of tokens) never dumps everything at once and the
// initial draw stays small and instant. Trees at or under `bigThreshold` nodes
// open fully expanded, since they are small enough to read at a glance.
export function defaultCollapsed(root: TreeNode, openDepth = 1, bigThreshold = 30, maxFanout = 60): Set<number> {
	const set = new Set<number>();
	if (countNodes(root) <= bigThreshold) return set;
	const walk = (n: TreeNode, depth: number) => {
		if (n.children.length && (depth >= openDepth || n.children.length > maxFanout)) set.add(n.id);
		n.children.forEach((c) => walk(c, depth + 1));
	};
	walk(root, 0);
	return set;
}
