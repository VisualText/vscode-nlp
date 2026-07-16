// Webview adapter: draw an NLP++ .tree file as a linguistic tree graphic.
//
// This is the ONLY file in src/treeview that imports 'vscode'. The parse, layout,
// and SVG generation all live in pure modules (parseTree/layout/renderSvg), so
// the visualization logic is unit-testable without an Electron host. The webview
// hosts the SVG, supports wheel-zoom / drag-pan, and posts a "reveal" message
// back when a node is clicked so the extension can select that text span.

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { parseTree } from "./parseTree";
import { layoutTree } from "./layout";
import { renderTreeSvg } from "./renderSvg";

function nonce(): string {
	let s = "";
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 24; i++) s += chars[Math.floor(Math.random() * chars.length)];
	return s;
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
	// Strict CSP: only our nonce'd inline script runs; styles are inline.
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
  .node.leaf text { fill: var(--vscode-editor-foreground); }
  .node { cursor:pointer; }
  .node:hover text { fill: var(--vscode-textLink-activeForeground, #4daafc); text-decoration:underline; }
  #hint { position:fixed; bottom:8px; left:10px; font-size:11px; opacity:.6; }
</style>
</head>
<body>
<div id="wrap">${svg}</div>
<div id="hint">scroll = zoom · drag = pan · click a node = reveal in text</div>
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const wrap = document.getElementById('wrap');
  const vp = document.getElementById('viewport');
  let scale = 1, tx = 0, ty = 0, panning = false, sx = 0, sy = 0;
  function apply(){ vp.setAttribute('transform', 'translate('+tx+','+ty+') scale('+scale+')'); }
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.1 : 1/1.1;
    scale = Math.max(0.15, Math.min(6, scale * f));
    apply();
  }, { passive:false });
  wrap.addEventListener('mousedown', (e) => { panning = true; sx = e.clientX - tx; sy = e.clientY - ty; wrap.classList.add('grabbing'); });
  window.addEventListener('mousemove', (e) => { if(panning){ tx = e.clientX - sx; ty = e.clientY - sy; apply(); } });
  window.addEventListener('mouseup', () => { panning = false; wrap.classList.remove('grabbing'); });
  document.getElementById('tree').addEventListener('click', (e) => {
    const g = e.target.closest('.node'); if(!g) return;
    const start = +g.getAttribute('data-start'), end = +g.getAttribute('data-end');
    if(end >= start) vscode.postMessage({ type:'reveal', start, end });
  });
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
	const svg = renderTreeSvg(layoutTree(root));
	const inputFile = inputFileForTree(treeUri.fsPath);

	const panel = vscode.window.createWebviewPanel(
		"nlpTreeGraph",
		"Parse Tree — " + path.basename(treeUri.fsPath),
		vscode.ViewColumn.Beside,
		{ enableScripts: true, retainContextWhenHidden: true },
	);
	panel.webview.html = html(svg, nonce());
	panel.webview.onDidReceiveMessage((m) => {
		if (m?.type === "reveal" && inputFile) revealSpan(inputFile, m.start, m.end);
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
