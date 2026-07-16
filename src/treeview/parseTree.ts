// Pure parser: NLP++ .tree text -> node hierarchy.
//
// PURE MODULE: no 'vscode' import. A .tree file is an indented list where indent
// depth gives the hierarchy and each node line is
//   <indent><label> [start,end,ustart,uend,passNum,ruleLine,type, (attrs...)]
// (matching TreeFile.parseTreeLine). We keep the label, the text char span
// (start/end, used for click-to-reveal), and the node type. Banner lines
// ("*****", "PASS N (...)") and blank lines are skipped.

export interface TreeNode {
	id: number;    // stable pre-order id (used to track collapse state)
	label: string;
	type: string;
	start: number; // char offset span in the analyzed text
	end: number;
	children: TreeNode[];
}

export interface ParseOptions {
	skipWhitespace?: boolean; // drop "white"-type tokens (the "\_" nodes) for a cleaner tree
}

export function parseTree(text: string, opts: ParseOptions = {}): TreeNode | undefined {
	const skipWs = opts.skipWhitespace ?? true;
	const roots: TreeNode[] = [];
	const stack: Array<{ node: TreeNode; indent: number }> = [];

	for (const raw of text.split(/\r?\n/)) {
		if (!raw.trim()) continue;
		const trimmed = raw.trim();
		if (trimmed.startsWith("*") || /^PASS\b/.test(trimmed)) continue; // banner

		const br = raw.indexOf("[");
		if (br < 0) continue; // not a node line

		// A node whose label is literally "[" is written as a line starting with "[".
		let label: string;
		let metaChunk: string;
		if (trimmed.startsWith("[")) {
			label = "[";
			const rest = raw.slice(raw.indexOf("[") + 1);
			metaChunk = rest.slice(rest.indexOf("[") + 1);
		} else {
			label = raw.slice(0, br).trim();
			metaChunk = raw.slice(br + 1);
		}

		const fields = metaChunk.split(/[,\]]/);
		const start = parseInt(fields[0], 10) || 0;
		const end = parseInt(fields[1], 10) || 0;
		const type = (fields[6] || "").trim();

		if (skipWs && type === "white") continue;

		const indent = raw.search(/\S/);
		const node: TreeNode = { id: 0, label, type, start, end, children: [] };

		while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
		if (stack.length) stack[stack.length - 1].node.children.push(node);
		else roots.push(node);
		stack.push({ node, indent });
	}

	let root: TreeNode | undefined;
	if (roots.length === 1) root = roots[0];
	else if (roots.length > 1) root = { id: 0, label: "TREE", type: "root", start: 0, end: 0, children: roots };
	if (root) assignIds(root);
	return root;
}

// Assign stable pre-order ids so collapse state survives re-layout.
function assignIds(root: TreeNode): void {
	let next = 0;
	const walk = (n: TreeNode) => { n.id = next++; n.children.forEach(walk); };
	walk(root);
}
