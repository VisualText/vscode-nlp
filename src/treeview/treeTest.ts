// Pure-logic tests for the tree-visualization engines (parse / layout / render).
// Runs under plain Node via tsconfig.treeview.json; `npm run test:treeview`.

import { parseTree, subtreeText } from "./parseTree";
import { layoutTree, flatten, defaultCollapsed, countNodes, findNode, subtreeIds } from "./layout";
import { renderTreeSvg } from "./renderSvg";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: string): void {
	if (cond) passed++;
	else { failed++; console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`); }
}
function eq<T>(name: string, a: T, b: T): void {
	check(name, a === b, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// A small tree with a real phrase-structure shape and a whitespace token.
const TREE = [
	"***************",
	"    PASS 7 (np)",
	"***************",
	"_ROOT [0,20,0,20,0,0,node]",
	"   _NP [0,9,0,9,7,3,node]",
	"      John [0,3,0,3,0,0,alpha, (\"cap\" 1)]",
	"      \\_ [4,4,4,4,0,0,white]",
	"      Smith [5,9,5,9,0,0,alpha]",
	"   likes [11,15,11,15,0,0,alpha]",
	"",
].join("\n");

// ---- parse -----------------------------------------------------------------
{
	const root = parseTree(TREE)!;
	check("parse: root is _ROOT", !!root && root.label === "_ROOT");
	eq("parse: _ROOT has 2 children (NP, likes)", root.children.length, 2);
	const np = root.children[0];
	eq("parse: _NP label", np.label, "_NP");
	eq("parse: _NP has 2 word children (whitespace skipped)", np.children.length, 2);
	eq("parse: first word is John", np.children[0].label, "John");
	eq("parse: John span start", np.children[0].start, 0);
	eq("parse: John span end", np.children[0].end, 3);
	eq("parse: NP type is node", np.type, "node");

	// Whitespace retained when asked.
	const withWs = parseTree(TREE, { skipWhitespace: false })!;
	eq("parse: whitespace kept when requested", withWs.children[0].children.length, 3);
}

// ---- layout ----------------------------------------------------------------
{
	const root = parseTree(TREE)!;
	const layout = layoutTree(root, { colWidth: 100, rowHeight: 50, margin: 10 });
	const all = flatten(layout.root);
	const leaves = all.filter((n) => n.children.length === 0);

	check("layout: 3 leaves (John, Smith, likes)", leaves.length === 3, String(leaves.length));
	let mono = true;
	for (let i = 1; i < leaves.length; i++) if (leaves[i].x <= leaves[i - 1].x) mono = false;
	check("layout: leaf x strictly increasing", mono);

	let centered = true;
	for (const n of all) if (n.children.length) {
		const mid = (n.children[0].x + n.children[n.children.length - 1].x) / 2;
		if (Math.abs(mid - n.x) > 1e-6) centered = false;
	}
	check("layout: parents centered over children", centered);

	// Depth increases downward: _ROOT above _NP above John.
	const rootY = layout.root.y;
	const npY = layout.root.children[0].y;
	check("layout: child rows are below parent rows", npY > rootY);
	check("layout: positive canvas size", layout.width > 0 && layout.height > 0);
	eq("layout: reports its colWidth", layout.colWidth, 100);
	// Tighter spacing yields a narrower canvas (horizontal squeeze).
	const tight = layoutTree(root, { colWidth: 30, rowHeight: 50, margin: 10 });
	check("layout: smaller colWidth -> narrower", tight.width < layout.width, `${tight.width} < ${layout.width}`);
	check("layout: _NP marked hasKids", layout.root.children[0].hasKids === true);
	check("layout: leaf not hasKids", leaves[0].hasKids === false);

	// Adjacent leaves are staggered vertically so long labels don't overlap.
	const st = flatten(layoutTree(root, { colWidth: 100, rowHeight: 50, margin: 10, stagger: 22 }).root)
		.filter((n) => n.children.length === 0);
	check("layout: adjacent leaves staggered in y", st.length >= 2 && st[0].y !== st[1].y, `${st[0]?.y} vs ${st[1]?.y}`);
	// With stagger off, leaves share a row.
	const flat = flatten(layoutTree(root, { colWidth: 100, rowHeight: 50, margin: 10, stagger: 0 }).root)
		.filter((n) => n.children.length === 0);
	check("layout: stagger:0 keeps leaves on one row", flat[0].y === flat[1].y);
}

// ---- collapse --------------------------------------------------------------
{
	const root = parseTree(TREE)!;
	const npId = root.children[0].id; // the _NP node
	const full = flatten(layoutTree(root).root).length;
	const collapsed = layoutTree(root, { isCollapsed: (id) => id === npId });
	const nodes = flatten(collapsed.root);
	check("collapse: fewer nodes when _NP collapsed", nodes.length < full, `${nodes.length} vs ${full}`);
	const np = nodes.find((n) => n.id === npId)!;
	check("collapse: _NP now shows as collapsed", np.collapsed === true && np.children.length === 0);
	check("collapse: _NP's words are hidden", !nodes.some((n) => n.label === "John"));
	check("collapse: collapsed node still hasKids", np.hasKids === true);

	// Render marks it: data-haskids and a marker.
	const svg = renderTreeSvg(collapsed);
	check("collapse: render sets data-haskids", svg.includes('data-haskids="1"'));
	check("collapse: render draws a marker", svg.includes('class="marker"'));
}

// ---- render ----------------------------------------------------------------
{
	const svg = renderTreeSvg(layoutTree(parseTree(TREE)!));
	check("render: is an <svg>", svg.startsWith("<svg") && svg.endsWith("</svg>"));
	check("render: has a viewport group", svg.includes('id="viewport"'));
	// Regression: the svg must fill the container (width/height 100%) and carry the
	// tree size in data-w/data-h, NOT as a giant intrinsic width that overflows the
	// compositor's max texture size (the "big black squares" bug).
	check("render: svg fills container", svg.includes('width="100%"') && svg.includes('height="100%"'));
	check("render: tree size in data attrs", svg.includes("data-w=") && svg.includes("data-h="));
	check("render: no giant intrinsic width", !/<svg[^>]*\swidth="\d{3,}"/.test(svg));
	// Each node has a generous invisible hit rect (bigger click target than the glyphs).
	const hits = (svg.match(/class="hit"/g) || []).length;
	const nodeCount = (svg.match(/class="node/g) || []).length;
	eq("render: one hit rect per node", hits, nodeCount);
	const mw = /class="hit"[^>]*\bwidth="(\d+)"/.exec(svg);
	check("render: hit width is generous (>=30)", !!mw && +mw[1] >= 30, mw?.[1]);
	check("render: nodes carry data-start", svg.includes("data-start="));
	// One link per parent->child edge: _ROOT->_NP, _ROOT->likes, _NP->John, _NP->Smith = 4.
	eq("render: link count", (svg.match(/class="link"/g) || []).length, 4);
	// XML-escaping: a label with special chars must be escaped.
	const amp = renderTreeSvg(layoutTree(parseTree("_ROOT [0,1,0,1,0,0,node]\n   a&b [0,1,0,1,0,0,alpha]\n")!));
	check("render: escapes ampersand", amp.includes("a&amp;b") && !amp.includes("a&b<"));
}

// ---- default collapse: drill one level at a time --------------------------
{
	// Build a deep-ish tree big enough to trip the threshold: root -> A -> B -> C -> leaf,
	// repeated so countNodes > threshold.
	const deep: string[] = ["_ROOT [0,99,0,99,0,0,node]"];
	for (let i = 0; i < 12; i++) {
		deep.push("   _S [0,9,0,9,0,0,node]");
		deep.push("      _NP [0,4,0,4,0,0,node]");
		deep.push("         w" + i + " [0,1,0,1,0,0,alpha]");
	}
	const root = parseTree(deep.join("\n"))!;
	check("default: tree is big enough to collapse", countNodes(root) > 30);

	const set = defaultCollapsed(root); // openDepth = 1
	check("default: root is NOT collapsed", !set.has(root.id));
	// Every depth-1 internal node IS collapsed (only the root opens).
	const depth1 = root.children.filter((c) => c.children.length);
	check("default: all depth-1 internal nodes collapsed", depth1.every((c) => set.has(c.id)), String(depth1.length));

	// Rendering with the default: only root + its direct children are visible.
	const visible = flatten(layoutTree(root, { isCollapsed: (id) => set.has(id) }).root);
	const expected = 1 + root.children.length; // root + immediate children
	eq("default: only root + immediate children shown", visible.length, expected);

	// Expanding ONE depth-1 node reveals only that node's children (one level).
	const target = depth1[0];
	set.delete(target.id);
	const afterVisible = flatten(layoutTree(root, { isCollapsed: (id) => set.has(id) }).root);
	eq("default: expanding one node adds exactly its children",
		afterVisible.length, expected + target.children.length);
	// The grandchildren of the expanded node stay collapsed (not revealed).
	const grandkids = target.children.flatMap((c) => c.children.map((g) => g.id));
	check("default: grandchildren remain hidden",
		grandkids.every((gid) => !afterVisible.some((n) => n.id === gid)));

	// A small tree opens fully expanded.
	const small = parseTree("_ROOT [0,2,0,2,0,0,node]\n   a [0,1,0,1,0,0,alpha]\n   b [1,2,1,2,0,0,alpha]\n")!;
	eq("default: small tree not collapsed", defaultCollapsed(small).size, 0);

	// A very wide node (flat tokenizer row) is collapsed by default so the first
	// draw stays small — even though it's at depth 0. Keeps opening instant.
	const wide: string[] = ["_ROOT [0,999,0,999,0,0,node]"];
	for (let i = 0; i < 120; i++) wide.push("   w" + i + " [0,1,0,1,0,0,alpha]");
	const wideRoot = parseTree(wide.join("\n"))!;
	const wideSet = defaultCollapsed(wideRoot);
	check("default: high-fanout root collapsed", wideSet.has(wideRoot.id));
	const visibleWide = flatten(layoutTree(wideRoot, { isCollapsed: (id) => wideSet.has(id) }).root);
	eq("default: wide tree draws just the root initially", visibleWide.length, 1);
}

// ---- subtreeText (graph selected portion) ----------------------------------
{
	const lines = [
		"_ROOT [0,20,0,20,0,0,node]",     // 0
		"   _S [0,20,0,20,0,0,node]",      // 1
		"      _NP [0,9,0,9,0,0,node]",    // 2
		"         John [0,3,0,3,0,0,alpha]", // 3
		"         Smith [5,9,5,9,0,0,alpha]", // 4
		"      _VP [11,20,11,20,0,0,node]", // 5
		"         likes [11,15,11,15,0,0,alpha]", // 6
	].join("\n");

	// Subtree at the _NP line (2) = _NP + its two words (lines 2..4), not _VP.
	const npSub = subtreeText(lines, 2);
	const npRoot = parseTree(npSub)!;
	eq("subtree: _NP root", npRoot.label, "_NP");
	eq("subtree: _NP has 2 word children", npRoot.children.length, 2);
	check("subtree: does not include _VP", !npSub.includes("_VP"));

	// Subtree at the root line (0) = the whole tree.
	const whole = parseTree(subtreeText(lines, 0))!;
	eq("subtree: root gives whole tree", whole.label, "_ROOT");
	check("subtree: whole tree includes _VP", subtreeText(lines, 0).includes("_VP"));

	// Subtree at a leaf line (3) = just that leaf.
	const leaf = parseTree(subtreeText(lines, 3))!;
	eq("subtree: leaf line yields single node", leaf.label, "John");
	eq("subtree: leaf has no children", leaf.children.length, 0);

	// A selected line range (lines 2..6) parses as a forest -> wrapped root.
	const range = lines.split("\n").slice(2, 7).join("\n");
	const forest = parseTree(range)!;
	check("selection: NP and VP are siblings under a wrapper", forest.children.length === 2, forest.label);
}

// ---- expand-all / collapse-all subtree helpers -----------------------------
{
	const root = parseTree(TREE)!;          // _ROOT -> (_NP -> John, Smith), likes
	const np = root.children[0];            // _NP
	check("findNode: locates _NP by id", findNode(root, np.id)?.label === "_NP");
	check("findNode: missing id -> undefined", findNode(root, 9999) === undefined);

	// All ids under _NP: _NP + John + Smith = 3.
	eq("subtreeIds: all under _NP", subtreeIds(np).length, 3);
	// Internal-only under _NP: just _NP (John/Smith are leaves).
	eq("subtreeIds: internal-only under _NP", subtreeIds(np, true).length, 1);

	// Collapse-all under root then expand-all under root round-trips visibility.
	const collapsed = new Set<number>(subtreeIds(root, true));
	const afterCollapse = flatten(layoutTree(root, { isCollapsed: (id) => collapsed.has(id) }).root);
	eq("collapse-all: only root visible", afterCollapse.length, 1);
	subtreeIds(root, false).forEach((id) => collapsed.delete(id));
	const afterExpand = flatten(layoutTree(root, { isCollapsed: (id) => collapsed.has(id) }).root);
	eq("expand-all: whole tree visible", afterExpand.length, countNodes(root));

	// Tree-level "Collapse all" = every internal node except the root -> only the
	// root and its immediate children show.
	const collapseAllTree = new Set(subtreeIds(root, true).filter((id) => id !== root.id));
	const compact = flatten(layoutTree(root, { isCollapsed: (id) => collapseAllTree.has(id) }).root);
	eq("collapse-all-tree: root + immediate children", compact.length, 1 + root.children.length);
}

console.log(`\ntreeview tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
