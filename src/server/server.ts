// NLP++ language server, as a Node process.
//
// The handlers are in serverCore.ts, shared with the browser build
// (browserServer.ts). This entry adds the two things only Node has: a transport
// chosen on the command line, and a disk to find the workspace's files on.
//
// Any LSP-speaking editor can run it -- the VS Code extension over node-ipc, and
// Neovim, Emacs, Sublime or JetBrains (via LSP4IJ) by pointing the client at
// dist/server.js with `--stdio`.

import { createConnection, ProposedFeatures } from "vscode-languageserver/node";
import { startServer } from "./serverCore";
import { NodeFiles } from "./nodeFiles";

startServer(createConnection(ProposedFeatures.all), new NodeFiles()).listen();
