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
}

export interface LayoutOptions {
	colWidth?: number;  // horizontal spacing between adjacent leaves
	rowHeight?: number; // vertical spacing between depths
	margin?: number;    // padding around the drawing
	isCollapsed?: (id: number) => boolean; // hide this node's subtree
}

export function layoutTree(root: TreeNode, opts: LayoutOptions = {}): LayoutResult {
	const colWidth = opts.colWidth ?? 90;
	const rowHeight = opts.rowHeight ?? 64;
	const margin = opts.margin ?? 24;
	const isCollapsed = opts.isCollapsed ?? (() => false);

	let nextLeaf = 0;
	let maxDepth = 0;

	const place = (node: TreeNode, depth: number): LayoutNode => {
		if (depth > maxDepth) maxDepth = depth;
		const hasKids = node.children.length > 0;
		const collapsed = hasKids && isCollapsed(node.id);
		// A collapsed node is drawn as a leaf; its subtree is not laid out.
		const children = collapsed ? [] : node.children.map((c) => place(c, depth + 1));
		let x: number;
		if (children.length === 0) {
			x = margin + nextLeaf * colWidth;
			nextLeaf++;
		} else {
			x = (children[0].x + children[children.length - 1].x) / 2;
		}
		return {
			id: node.id, label: node.label, type: node.type, start: node.start, end: node.end,
			x, y: margin + depth * rowHeight, hasKids, collapsed, children,
		};
	};

	const laid = place(root, 0);
	const leaves = Math.max(1, nextLeaf);
	return {
		root: laid,
		width: margin * 2 + (leaves - 1) * colWidth + colWidth, // room for last label
		height: margin * 2 + maxDepth * rowHeight + rowHeight,
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

// The set of node ids collapsed when the view first opens. With openDepth = 1
// only the root is expanded, so its children show as collapsed markers and the
// user drills in one node at a time (expanding a node reveals just its immediate
// children, which stay collapsed). Trees at or under `bigThreshold` nodes open
// fully expanded, since they are small enough to read at a glance.
export function defaultCollapsed(root: TreeNode, openDepth = 1, bigThreshold = 30): Set<number> {
	const set = new Set<number>();
	if (countNodes(root) <= bigThreshold) return set;
	const walk = (n: TreeNode, depth: number) => {
		if (depth >= openDepth && n.children.length) set.add(n.id);
		n.children.forEach((c) => walk(c, depth + 1));
	};
	walk(root, 0);
	return set;
}
