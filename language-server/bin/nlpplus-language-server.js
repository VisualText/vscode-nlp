#!/usr/bin/env node
// Entry point for editors other than VSCode (Neovim, Helix, Emacs, Zed,
// Sublime, Kate). The server itself is the same dist/server.js bundle the
// VisualText extension runs; this wrapper only supplies a default transport.
//
// vscode-languageserver picks its transport from argv and refuses to start
// without one, so a bare `nlpplus-language-server` -- what most editor configs
// spell -- would exit with "Connection input stream is not set". Default to
// stdio unless the caller chose a transport.

const TRANSPORTS = ["--stdio", "--node-ipc", "--pipe", "--socket"];

if (process.argv.includes("--version") || process.argv.includes("-v")) {
	console.log(require("../package.json").version);
	process.exit(0);
}
if (!process.argv.slice(2).some((a) => TRANSPORTS.some((t) => a === t || a.startsWith(t + "=")))) {
	process.argv.push("--stdio");
}

require("../dist/server.js");
