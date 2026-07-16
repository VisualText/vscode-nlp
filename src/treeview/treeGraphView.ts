// Webview adapter: draw an NLP++ .tree file as a linguistic tree graphic.
//
// This is the ONLY file in src/treeview that imports 'vscode'. Parse, layout, and
// SVG generation live in pure modules (parseTree/layout/renderSvg). A single
// panel is reused across invocations (so re-opening is instant), large trees
// collapse below a depth by default (so the first render stays small and fast),
// and clicking an internal node expands/collapses it while clicking a leaf
// reveals its text span. Collapse re-renders in place, preserving zoom/pan.

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { parseTree, TreeNode } from "./parseTree";
import { layoutTree } from "./layout";
import { renderTreeSvg } from "./renderSvg";

// Trees larger than this open collapsed below DEFAULT_OPEN_DEPTH.
const BIG_TREE = 60;
const DEFAULT_OPEN_DEPTH = 2;

interface ViewState {
	root: TreeNode;
	collapsed: Set<number>;
	inputFile: string | undefined;
	title: string;
}

let panel: vscode.WebviewPanel | undefined;
let state: ViewState | undefined;

function nonce(): string {
	let s = "";
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 24; i++) s += chars[Math.floor(Math.random() * chars.length)];
	return s;
}

function countNodes(n: TreeNode): number {
	return 1 + n.children.reduce((s, c) => s + countNodes(c), 0);
}

// Collapse internal nodes at/below DEFAULT_OPEN_DEPTH for big trees, so the
// initial view is compact. Small trees open fully expanded.
function defaultCollapsed(root: TreeNode): Set<number> {
	const set = new Set<number>();
	if (countNodes(root) <= BIG_TREE) return set;
	const walk = (n: TreeNode, depth: number) => {
		if (depth >= DEFAULT_OPEN_DEPTH && n.children.length) set.add(n.id);
		n.children.forEach((c) => walk(c, depth + 1));
	};
	walk(root, 0);
	return set;
}

function renderSvg(): string {
	if (!state) return "";
	const layout = layoutTree(state.root, { isCollapsed: (id) => state!.collapsed.has(id) });
	return renderTreeSvg(layout);
}

// The analyzed text sits next to its tree log: <dir>/<name>_log/anaNNN.tree -> <dir>/<name>.
function inputFileForTree(treeFsPath: string): string | undefined {
	const logDir = path.dirname(treeFsPath);
	if (!/_log$/.test(logDir)) return undefined;
	const input = logDir.replace(/_log$/, "");
	return fs.existsSync(input) ? input : undefined;
}

function revealSpan(inputFile: string, start: number, end: number): void {
	vscode.workspace.openTextDocument(vscode.Uri.file(inputFile)).then((doc) => {
		vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: false }).then((ed) => {
			const range = new vscode.Range(doc.positionAt(start), doc.positionAt(end + 1));
			ed.selection = new vscode.Selection(range.start, range.end);
			ed.revealRange(range, vscode.TextEditorRevealType.InCenter);
		});
	});
}

function html(svg: string, n: string): string {
	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${n}';"/>
<style>
  html,body { margin:0; padding:0; height:100%; overflow:hidden;
    background: var(--vscode-editor-background); color: var(--vscode-editor-foreground);
    font-family: var(--vscode-editor-font-family, sans-serif); }
  #wrap { width:100vw; height:100vh; overflow:hidden; cursor:grab; }
  #wrap.grabbing { cursor:grabbing; }
  svg { user-select:none; }
  .link { stroke: var(--vscode-editorIndentGuide-background, #888); stroke-width:1.2; }
  .node text { font-size:13px; fill: var(--vscode-editor-foreground); }
  .node.internal text { font-weight:600; fill: var(--vscode-symbolIcon-functionForeground, #b58900); }
  .node.collapsed text { text-decoration: underline dotted; }
  .marker { fill: var(--vscode-symbolIcon-functionForeground, #b58900); }
  .node { cursor:pointer; }
  .node:hover text { fill: var(--vscode-textLink-activeForeground, #4daafc); }
  #hint { position:fixed; bottom:8px; left:10px; font-size:11px; opacity:.6; }
</style>
</head>
<body>
<div id="wrap">${svg}</div>
<div id="hint">scroll = zoom · drag = pan · click a phrase node = expand/collapse · click a word = reveal in text</div>
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const wrap = document.getElementById('wrap');
  let scale = 1, tx = 0, ty = 0, panning = false, sx = 0, sy = 0;
  function vp(){ return document.getElementById('viewport'); }
  function apply(){ const v = vp(); if(v) v.setAttribute('transform','translate('+tx+','+ty+') scale('+scale+')'); }
  function fit(){
    const svg = document.getElementById('tree'); if(!svg) return;
    const w = +svg.getAttribute('width'), h = +svg.getAttribute('height');
    const vw = wrap.clientWidth, vh = wrap.clientHeight;
    scale = Math.max(0.1, Math.min(1, (vw-20)/w, (vh-20)/h));
    tx = Math.max(0, (vw - w*scale)/2); ty = 10;
    apply();
  }
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.1 : 1/1.1;
    scale = Math.max(0.1, Math.min(6, scale * f));
    apply();
  }, { passive:false });
  wrap.addEventListener('mousedown', (e) => { panning = true; sx = e.clientX - tx; sy = e.clientY - ty; wrap.classList.add('grabbing'); });
  window.addEventListener('mousemove', (e) => { if(panning){ tx = e.clientX - sx; ty = e.clientY - sy; apply(); } });
  window.addEventListener('mouseup', () => { panning = false; wrap.classList.remove('grabbing'); });
  wrap.addEventListener('click', (e) => {
    const g = e.target.closest && e.target.closest('.node'); if(!g) return;
    if(g.getAttribute('data-haskids') === '1') {
      vscode.postMessage({ type:'toggle', id: +g.getAttribute('data-id') });
    } else {
      const start = +g.getAttribute('data-start'), end = +g.getAttribute('data-end');
      if(end >= start) vscode.postMessage({ type:'reveal', start, end });
    }
  });
  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if(m.type === 'update'){ wrap.innerHTML = m.svg; if(m.reset) fit(); else apply(); }
  });
  fit();
</script>
</body>
</html>`;
}

export function showTreeGraph(ctx: vscode.ExtensionContext, treeUri: vscode.Uri): void {
	let text: string;
	try {
		text = fs.readFileSync(treeUri.fsPath, "utf8");
	} catch {
		vscode.window.showErrorMessage("Could not read tree file: " + treeUri.fsPath);
		return;
	}
	const root = parseTree(text);
	if (!root) {
		vscode.window.showInformationMessage("No parse tree found in this file.");
		return;
	}

	state = {
		root,
		collapsed: defaultCollapsed(root),
		inputFile: inputFileForTree(treeUri.fsPath),
		title: "Parse Tree — " + path.basename(treeUri.fsPath),
	};
	const svg = renderSvg();

	if (panel) {
		panel.title = state.title;
		panel.webview.postMessage({ type: "update", svg, reset: true });
		panel.reveal(vscode.ViewColumn.Beside, true);
		return;
	}

	panel = vscode.window.createWebviewPanel(
		"nlpTreeGraph", state.title, vscode.ViewColumn.Beside,
		{ enableScripts: true, retainContextWhenHidden: true },
	);
	panel.webview.html = html(svg, nonce());
	panel.onDidDispose(() => { panel = undefined; state = undefined; }, undefined, ctx.subscriptions);
	panel.webview.onDidReceiveMessage((m) => {
		if (!state) return;
		if (m?.type === "reveal" && state.inputFile) {
			revealSpan(state.inputFile, m.start, m.end);
		} else if (m?.type === "toggle") {
			if (state.collapsed.has(m.id)) state.collapsed.delete(m.id);
			else state.collapsed.add(m.id);
			panel?.webview.postMessage({ type: "update", svg: renderSvg(), reset: false });
		}
	}, undefined, ctx.subscriptions);
}

export function registerTreeGraph(ctx: vscode.ExtensionContext): void {
	ctx.subscriptions.push(
		vscode.commands.registerCommand("nlp.showTreeGraph", (uri?: vscode.Uri) => {
			const target = uri ?? vscode.window.activeTextEditor?.document.uri;
			if (!target) {
				vscode.window.showInformationMessage("Open a .tree file to view its parse tree graphic.");
				return;
			}
			showTreeGraph(ctx, target);
		}),
	);
}
