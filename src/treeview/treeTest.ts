// Pure-logic tests for the tree-visualization engines (parse / layout / render).
// Runs under plain Node via tsconfig.treeview.json; `npm run test:treeview`.

import { parseTree } from "./parseTree";
import { layoutTree, flatten } from "./layout";
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
	check("layout: _NP marked hasKids", layout.root.children[0].hasKids === true);
	check("layout: leaf not hasKids", leaves[0].hasKids === false);
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
	check("render: nodes carry data-start", svg.includes("data-start="));
	// One link per parent->child edge: _ROOT->_NP, _ROOT->likes, _NP->John, _NP->Smith = 4.
	eq("render: link count", (svg.match(/class="link"/g) || []).length, 4);
	// XML-escaping: a label with special chars must be escaped.
	const amp = renderTreeSvg(layoutTree(parseTree("_ROOT [0,1,0,1,0,0,node]\n   a&b [0,1,0,1,0,0,alpha]\n")!));
	check("render: escapes ampersand", amp.includes("a&amp;b") && !amp.includes("a&b<"));
}

console.log(`\ntreeview tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
