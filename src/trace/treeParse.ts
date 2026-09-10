// Parser for the engine's .tree dump format.
//
// PURE MODULE: no 'vscode' import. Every analyzer run writes one ana###.tree per
// pass into <input>/<text>_log/, and each is a full snapshot of the parse tree at
// that point. Together they are a complete execution trace, which is what the
// replay debugger steps through.
//
// The line format is produced by Pn::print in the engine (lite/pn.cpp):
//
//   <indent><name>[ r_to_l] [start,end,ustart,uend,passnum,ruleline,type<,flags>[, attrs]]
//
// Flags are emitted ONLY when set, each as its own comma-separated token, in this
// fixed order: b (base), un (unsealed), sem, fired, blt (built). They are
// therefore NAMED, not positional -- "node,un" means unsealed, not fired. The
// older positional reader in treeFile.ts (which takes field 7 as "fired" and
// field 8 as "built") mis-reads every unsealed-but-unfired node for that reason.
//
// Attributes come last as space-separated ("name" value) pairs, where value may
// be a quoted string, a number, or a concept reference like concept:"sentence1".

export interface TraceAttribute {
	name: string;
	value: string;
}

export interface TraceNode {
	name: string;
	// Byte offsets into the input text, then the same span in UTF-16 units. The
	// engine tracks both because a non-ASCII input makes them diverge, and the
	// editor needs the u* pair to highlight the right characters.
	start: number;
	end: number;
	ustart: number;
	uend: number;
	// Which pass built this node, and the line of that pass file holding the rule
	// that did it. 0/0 means the node predates any rule -- a raw token from
	// tokenization. This pair is what makes go-to-the-rule-that-built-this work.
	passNum: number;
	ruleLine: number;
	type: string; // node | alpha | punct | white | num | ...
	base: boolean;
	unsealed: boolean;
	sem: boolean;
	fired: boolean;
	built: boolean;
	attributes: TraceAttribute[];
	depth: number;
	children: TraceNode[];
}

export interface PassTree {
	passNum: number;   // 1-based, as printed in the "PASS n (name)" header
	passName: string;  // the pass's base name, e.g. "moneyAttributes"
	root: TraceNode | undefined;
	nodeCount: number;
}

// "    PASS 15 (moneyAttributes)"
const HEADER = /^\s*PASS\s+(\d+)\s*\(([^)]*)\)/;

// <indent><name> [<fields>]   -- name is non-greedy so a literal "[" node
// (the token for an open bracket in the input) parses as its own name.
const LINE = /^(\s*)(.*?)\s+\[([^\]]*)\]\s*$/;

// The engine appends " r_to_l" to the name in UNICODE builds.
const RTL_SUFFIX = / r_to_l$/;

const INDENT_WIDTH = 3; // spaces per tree level, per Pn::print

// Pull ("name" value) pairs off the tail of a field list. Scans with a paren
// depth counter rather than a regex so a value containing parens cannot end the
// attribute early.
function parseAttributes(text: string): TraceAttribute[] {
	const out: TraceAttribute[] = [];
	let i = 0;
	while (i < text.length) {
		if (text[i] !== "(") { i++; continue; }
		let depth = 0;
		const start = i;
		while (i < text.length) {
			if (text[i] === "(") depth++;
			else if (text[i] === ")") {
				depth--;
				if (depth === 0) { i++; break; }
			}
			i++;
		}
		const body = text.slice(start + 1, i - 1).trim();
		const m = /^"([^"]*)"\s*(.*)$/.exec(body);
		if (m) out.push({ name: m[1], value: m[2].trim() });
	}
	return out;
}

// The flags a node line can carry, in the order Pn::print emits them.
export interface NodeFlags {
	base: boolean;     // b
	unsealed: boolean; // un
	sem: boolean;      // sem
	fired: boolean;    // fired -- a rule matched here
	built: boolean;    // blt   -- a rule created this node
}

const FLAG_NAMES = new Set(["b", "un", "sem", "fired", "blt"]);

// Read node flags out of the comma-separated fields that FOLLOW the type field.
//
// Shared with the older reader in treeFile.ts so the two cannot drift: both are
// looking at the same engine output, and the vocabulary belongs in one place.
//
// Reading these by POSITION is the trap. Because a flag is written only when it
// is set, the field after the type is whichever flag happens to be first --
// "node,un" is unsealed, not fired, and a node written "node,un,fired,blt" has
// "blt" two fields further along than one written "node,fired,blt". Any fixed
// index is therefore wrong for some real subset of nodes.
export function parseNodeFlags(fieldsAfterType: string[]): NodeFlags {
	const flags: NodeFlags = { base: false, unsealed: false, sem: false, fired: false, built: false };
	for (const raw of fieldsAfterType) {
		const flag = raw.trim();
		if (!FLAG_NAMES.has(flag)) continue;
		if (flag === "b") flags.base = true;
		else if (flag === "un") flags.unsealed = true;
		else if (flag === "sem") flags.sem = true;
		else if (flag === "fired") flags.fired = true;
		else if (flag === "blt") flags.built = true;
	}
	return flags;
}

// Parse one "<name> [<fields>]" line into a node, or undefined if the line is
// not a tree node (headers, blank lines, the "PAT OUTPUT TREE:" banner).
export function parseTreeLine(line: string): TraceNode | undefined {
	const m = LINE.exec(line);
	if (!m) return undefined;
	const [, indent, rawName, fields] = m;

	// Everything up to the first "(" is the comma-separated numeric/flag part;
	// the rest is attributes. Splitting there keeps a comma inside an attribute
	// value from being read as a field separator.
	const attrStart = fields.indexOf("(");
	const head = attrStart >= 0 ? fields.slice(0, attrStart) : fields;
	const tail = attrStart >= 0 ? fields.slice(attrStart) : "";

	const parts = head.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
	if (parts.length < 7) return undefined; // not a node line

	const num = (s: string): number => {
		const n = parseInt(s, 10);
		return Number.isFinite(n) ? n : 0;
	};

	const node: TraceNode = {
		name: rawName.replace(RTL_SUFFIX, "").trim(),
		start: num(parts[0]),
		end: num(parts[1]),
		ustart: num(parts[2]),
		uend: num(parts[3]),
		passNum: num(parts[4]),
		ruleLine: num(parts[5]),
		type: parts[6],
		...parseNodeFlags(parts.slice(7)),
		attributes: parseAttributes(tail),
		depth: Math.floor(indent.length / INDENT_WIDTH),
		children: [],
	};
	return node;
}

// Parse a whole ana###.tree file: the "PASS n (name)" header plus the indented
// node lines, rebuilt into a tree by indentation depth.
export function parseTreeFile(text: string): PassTree {
	let passNum = 0;
	let passName = "";
	let root: TraceNode | undefined;
	let nodeCount = 0;

	// stack[d] is the most recent node seen at depth d; a node at depth d
	// attaches to stack[d-1].
	const stack: TraceNode[] = [];

	for (const line of text.split(/\r?\n/)) {
		if (!passNum) {
			const h = HEADER.exec(line);
			if (h) {
				passNum = parseInt(h[1], 10);
				passName = h[2].trim();
				continue;
			}
		}
		const node = parseTreeLine(line);
		if (!node) continue;
		nodeCount++;

		if (node.depth === 0 || !stack.length) {
			root ??= node;
			stack.length = 0;
			stack[0] = node;
			continue;
		}
		// Clamp to the deepest available parent: a malformed or truncated dump
		// must not throw, it should still yield a usable tree.
		const parentDepth = Math.min(node.depth - 1, stack.length - 1);
		const parent = stack[parentDepth];
		if (parent) {
			parent.children.push(node);
			stack.length = parentDepth + 1;
			stack[parentDepth + 1] = node;
		}
	}

	return { passNum, passName, root, nodeCount };
}

// Depth-first walk in document order.
export function walkTree(node: TraceNode, visit: (n: TraceNode) => void): void {
	visit(node);
	for (const child of node.children) walkTree(child, visit);
}

// The deepest node whose span contains `offset`. Used to answer "what was this
// piece of text at this point in the run, and which rule made it?".
export function nodeAtOffset(root: TraceNode, offset: number): TraceNode | undefined {
	let best: TraceNode | undefined;
	walkTree(root, (n) => {
		if (offset >= n.start && offset <= n.end) {
			if (!best || n.depth > best.depth) best = n;
		}
	});
	return best;
}
