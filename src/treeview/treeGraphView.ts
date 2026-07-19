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
import { parseTree, subtreeText, TreeNode } from "./parseTree";
import { layoutTree, defaultCollapsed, findNode, subtreeIds } from "./layout";
import { renderTreeSvg } from "./renderSvg";

interface ViewState {
	root: TreeNode;
	collapsed: Set<number>;
	inputFile: string | undefined;
	title: string;
	colWidth: number; // horizontal spacing between nodes (adjustable via Shift+scroll)
}

// Tighter default than the old 90 so trees read more compactly out of the box.
const DEFAULT_COL_WIDTH = 52;
const MIN_COL_WIDTH = 16;
const MAX_COL_WIDTH = 160;

let panel: vscode.WebviewPanel | undefined;
let state: ViewState | undefined;
let panelReady = false;   // the webview has loaded and can receive messages
let pendingFlush = false;  // a tree is waiting to be sent once the webview is ready

function nonce(): string {
	let s = "";
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 24; i++) s += chars[Math.floor(Math.random() * chars.length)];
	return s;
}

function renderSvg(): string {
	if (!state) return "";
	const layout = layoutTree(state.root, {
		colWidth: state.colWidth,
		isCollapsed: (id) => state!.collapsed.has(id),
	});
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

function html(n: string): string {
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
  svg { user-select:none; display:block; width:100%; height:100%; }
  .link { stroke: var(--vscode-editorIndentGuide-background, #888); stroke-width:1.2; }
  .node text { font-size:13px; fill: var(--vscode-editor-foreground); pointer-events:none; }
  .node.internal text { font-weight:600; fill: var(--vscode-symbolIcon-functionForeground, #b58900); }
  .node.collapsed text { text-decoration: underline dotted; }
  .marker { fill: var(--vscode-symbolIcon-functionForeground, #b58900); pointer-events:none; }
  .hit { fill: transparent; }
  .node { cursor:pointer; }
  .node:hover .hit { fill: var(--vscode-editor-hoverHighlightBackground, rgba(120,140,200,.22)); }
  .node:hover text { fill: var(--vscode-textLink-activeForeground, #4daafc); }
  #hint { position:fixed; bottom:8px; left:10px; font-size:11px; opacity:.6; }
  #ph { position:absolute; top:50%; left:0; right:0; transform:translateY(-50%); text-align:center;
    opacity:.5; font-size:13px; line-height:1.6; padding:0 20px; }
  #menu { position:fixed; display:none; z-index:10; min-width:150px; padding:4px 0; font-size:12px;
    background: var(--vscode-menu-background, #252526); color: var(--vscode-menu-foreground, #ccc);
    border:1px solid var(--vscode-menu-border, #454545); border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,.4); }
  #menu div.item { padding:5px 16px; cursor:pointer; }
  #menu div.item:hover { background: var(--vscode-menu-selectionBackground, #094771); color: var(--vscode-menu-selectionForeground, #fff); }
  #menu div.sep { height:1px; margin:4px 0; background: var(--vscode-menu-separatorBackground, #454545); }
</style>
</head>
<body>
<div id="wrap"><div id="ph">Rendering parse tree…</div></div>
<div id="hint">scroll = zoom · shift+scroll = squeeze/spread · drag = pan · click = open one level · right-click = menu · click a word = reveal in text</div>
<div id="menu"></div>
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const wrap = document.getElementById('wrap');
  const menu = document.getElementById('menu');
  let menuId = -1;
  let scale = 1, tx = 0, ty = 0, panning = false, sx = 0, sy = 0;
  function hideMenu(){ menu.style.display = 'none'; }
  function vp(){ return document.getElementById('viewport'); }
  function apply(){ const v = vp(); if(v) v.setAttribute('transform','translate('+tx+','+ty+') scale('+scale+')'); }
  function fit(){
    const svg = document.getElementById('tree'); if(!svg) return;
    const w = +svg.getAttribute('data-w'), h = +svg.getAttribute('data-h');
    const vw = wrap.clientWidth, vh = wrap.clientHeight;
    scale = Math.max(0.02, Math.min(1, (vw-20)/w, (vh-20)/h));
    tx = Math.max(0, (vw - w*scale)/2); ty = 10;
    apply();
  }
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault(); hideMenu();
    if(e.shiftKey){
      // Shift+scroll squeezes/spreads horizontal spacing between nodes.
      const d = (e.deltaY !== 0 ? e.deltaY : e.deltaX);
      vscode.postMessage({ type:'colWidth', delta: d > 0 ? -6 : 6 });
      return;
    }
    const f = e.deltaY < 0 ? 1.1 : 1/1.1;
    scale = Math.max(0.02, Math.min(6, scale * f));
    apply();
  }, { passive:false });
  wrap.addEventListener('mousedown', (e) => { hideMenu(); panning = true; sx = e.clientX - tx; sy = e.clientY - ty; wrap.classList.add('grabbing'); });
  function buildMenu(nodeId){
    let h = '';
    if(nodeId >= 0){
      h += '<div class="item" data-act="expand">Expand all below</div>';
      h += '<div class="item" data-act="collapse">Collapse all below</div>';
      h += '<div class="sep"></div>';
    }
    h += '<div class="item" data-act="center">Center all</div>';
    h += '<div class="item" data-act="expandAll">Expand all</div>';
    h += '<div class="item" data-act="collapseAll">Collapse all</div>';
    menu.innerHTML = h;
  }
  wrap.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const g = e.target.closest && e.target.closest('.node');
    menuId = (g && g.getAttribute('data-haskids') === '1') ? +g.getAttribute('data-id') : -1;
    buildMenu(menuId);
    menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px'; menu.style.display = 'block';
  });
  menu.addEventListener('click', (e) => {
    const act = e.target && e.target.getAttribute('data-act');
    if(act === 'center') fit();
    else if(act === 'expand' && menuId >= 0) vscode.postMessage({ type:'expandAll', id: menuId });
    else if(act === 'collapse' && menuId >= 0) vscode.postMessage({ type:'collapseAll', id: menuId });
    else if(act === 'expandAll') vscode.postMessage({ type:'expandAllTree' });
    else if(act === 'collapseAll') vscode.postMessage({ type:'collapseAllTree' });
    hideMenu();
  });
  window.addEventListener('mousemove', (e) => { if(panning){ tx = e.clientX - sx; ty = e.clientY - sy; apply(); } });
  window.addEventListener('mouseup', () => { panning = false; wrap.classList.remove('grabbing'); });
  wrap.addEventListener('click', (e) => {
    hideMenu();
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
  // Tell the extension the webview is live so it can send the tree. Sending
  // before this would be lost (the listener above wouldn't exist yet).
  vscode.postMessage({ type:'ready' });
</script>
</body>
</html>`;
}

// Post the current tree to the webview once it's ready; buffer if it isn't yet.
function flush(): void {
	if (!panel || !state) return;
	panel.title = state.title;
	if (panelReady) {
		panel.webview.postMessage({ type: "update", svg: renderSvg(), reset: true });
	} else {
		pendingFlush = true; // webview will flush on its "ready" message
	}
}

// Core: open/refresh the graphic for `text`. The panel is created and revealed
// immediately (so the click feels instant); parsing, layout and SVG generation
// are deferred to the next tick and only sent once the webview signals ready —
// so a large tree never blocks the click, and no message is lost.
function openGraph(ctx: vscode.ExtensionContext, text: string, treeUri: vscode.Uri, titleSuffix: string): void {
	ensurePanel(ctx);
	panel!.reveal(vscode.ViewColumn.Beside, true);

	setTimeout(() => {
		const root = parseTree(text);
		if (!root) {
			vscode.window.showInformationMessage("No parse tree found to graph.");
			return;
		}
		state = {
			root,
			collapsed: defaultCollapsed(root),
			inputFile: inputFileForTree(treeUri.fsPath),
			title: "Parse Tree — " + path.basename(treeUri.fsPath) + titleSuffix,
			colWidth: state?.colWidth ?? DEFAULT_COL_WIDTH, // keep the user's spacing across re-opens
		};
		flush();
	}, 0);
}

// Create the reusable webview panel (with an empty shell) and wire its messages,
// once. Subsequent opens reuse it.
function ensurePanel(ctx: vscode.ExtensionContext): void {
	if (panel) return;
	panelReady = false;
	pendingFlush = false;
	panel = vscode.window.createWebviewPanel(
		"nlpTreeGraph", "Parse Tree",
		{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, // don't steal focus when pre-warming
		{ enableScripts: true, retainContextWhenHidden: true },
	);
	panel.webview.html = html(nonce());
	panel.onDidDispose(() => { panel = undefined; state = undefined; panelReady = false; }, undefined, ctx.subscriptions);
	panel.webview.onDidReceiveMessage((m) => {
		if (m?.type === "ready") {
			panelReady = true;
			if (pendingFlush) { pendingFlush = false; flush(); }
			return;
		}
		if (!state) return;
		if (m?.type === "reveal" && state.inputFile) {
			revealSpan(state.inputFile, m.start, m.end);
		} else if (m?.type === "toggle") {
			if (state.collapsed.has(m.id)) state.collapsed.delete(m.id);
			else state.collapsed.add(m.id);
			panel?.webview.postMessage({ type: "update", svg: renderSvg(), reset: false });
		} else if (m?.type === "expandAll" || m?.type === "collapseAll") {
			const node = findNode(state.root, m.id);
			if (node) {
				if (m.type === "expandAll") {
					// Reveal the whole subtree: nothing under (or at) this node collapsed.
					subtreeIds(node, false).forEach((id) => state!.collapsed.delete(id));
				} else {
					// Hide the whole subtree: this node and every collapsible descendant.
					subtreeIds(node, true).forEach((id) => state!.collapsed.add(id));
				}
				panel?.webview.postMessage({ type: "update", svg: renderSvg(), reset: false });
			}
		} else if (m?.type === "expandAllTree") {
			state.collapsed.clear();
			panel?.webview.postMessage({ type: "update", svg: renderSvg(), reset: false });
		} else if (m?.type === "collapseAllTree") {
			// Collapse every internal node except the root, so only the root's
			// immediate children show (the compact starting view).
			state.collapsed = new Set(subtreeIds(state.root, true).filter((id) => id !== state!.root.id));
			panel?.webview.postMessage({ type: "update", svg: renderSvg(), reset: false });
		} else if (m?.type === "colWidth") {
			state.colWidth = Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, state.colWidth + (m.delta || 0)));
			panel?.webview.postMessage({ type: "update", svg: renderSvg(), reset: false });
		}
	}, undefined, ctx.subscriptions);
}

// Graph the entire tree file.
function showTreeGraph(ctx: vscode.ExtensionContext, treeUri: vscode.Uri): void {
	// Prefer the open document's text (reflects any edits) over a disk read.
	const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === treeUri.toString());
	let text: string;
	if (open) {
		text = open.getText();
	} else {
		try { text = fs.readFileSync(treeUri.fsPath, "utf8"); }
		catch { vscode.window.showErrorMessage("Could not read tree file: " + treeUri.fsPath); return; }
	}
	openGraph(ctx, text, treeUri, "");
}

// Graph just the selected portion: the selected lines if there's a selection,
// otherwise the subtree rooted at the cursor's line.
function showTreeGraphSelection(ctx: vscode.ExtensionContext): void {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== "tree") {
		vscode.window.showInformationMessage("Select part of a .tree file to graph it.");
		return;
	}
	const doc = editor.document;
	const sel = editor.selection;
	let text: string;
	let suffix: string;
	if (!sel.isEmpty) {
		const lines: string[] = [];
		for (let i = sel.start.line; i <= sel.end.line; i++) lines.push(doc.lineAt(i).text);
		text = lines.join("\n");
		suffix = " (selection)";
	} else {
		text = subtreeText(doc.getText(), sel.active.line);
		suffix = " (subtree)";
	}
	openGraph(ctx, text, doc.uri, suffix);
}

export function registerTreeGraph(ctx: vscode.ExtensionContext): void {
	// The graphic is strictly on-demand: the webview is created only when the
	// user asks for it (title-bar icon or right-click). Nothing here runs when a
	// .tree file is merely opened, so opening a tree file is never slowed by it.
	ctx.subscriptions.push(
		vscode.commands.registerCommand("nlp.showTreeGraph", (uri?: vscode.Uri) => {
			const target = uri ?? vscode.window.activeTextEditor?.document.uri;
			if (!target) {
				vscode.window.showInformationMessage("Open a .tree file to view its parse tree graphic.");
				return;
			}
			showTreeGraph(ctx, target);
		}),
		vscode.commands.registerCommand("nlp.showTreeGraphSelection", () => showTreeGraphSelection(ctx)),
	);
}
