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

// Assign each leaf a stagger "row" so that labels on the same row never overlap.
// Leaves are processed left-to-right and placed on the lowest row whose last
// label ends far enough to the left (greedy lane packing = minimum rows). When
// the tree is spread out and nothing overlaps, every leaf lands on row 0 and the
// baseline is a single straight line. Returns the deepest row used.
function staggerLeaves(leaves: LayoutNode[], stagger: number, charWidth: number, labelGap: number, maxRows: number): number {
	if (stagger <= 0 || leaves.length === 0) return 0;
	const sorted = [...leaves].sort((a, b) => a.x - b.x);
	const rowRight: number[] = []; // right edge of the last label placed on each row
	let maxRow = 0;
	for (const leaf of sorted) {
		const hw = halfWidth(leaf.label, charWidth, 8);
		const left = leaf.x - hw;
		const right = leaf.x + hw;
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
		leaf.y += row * stagger;
		if (row > maxRow) maxRow = row;
	}
	return maxRow;
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
	const leafNodes: LayoutNode[] = [];

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
			x, y: margin + depth * rowHeight, hasKids, collapsed, children,
		};
		if (children.length === 0) leafNodes.push(laidNode);
		return laidNode;
	};

	const laid = place(root, 0);
	// Stagger only leaves whose labels would collide; the rest stay on the baseline.
	const maxRow = staggerLeaves(leafNodes, stagger, charWidth, labelGap, maxStaggerRows);
	const leaves = Math.max(1, nextLeaf);
	return {
		root: laid,
		width: margin * 2 + (leaves - 1) * colWidth + colWidth, // room for last label
		height: margin * 2 + maxDepth * rowHeight + rowHeight + maxRow * stagger,
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
