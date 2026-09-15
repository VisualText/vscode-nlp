// NLP++ language server, for a browser.
//
// The same handlers as dist/server.js (serverCore.ts), in a Web Worker. Two
// things differ, and nothing else:
//
//   transport  the worker's postMessage, not stdio or node-ipc
//   files      the page sends the workspace's files (nlp/workspaceFiles, see
//              memoryFiles.ts) -- a worker has no disk to walk
//
// From a page: start `new Worker(".../browserServer.js")` and speak LSP over the
// worker's messages (vscode-languageclient/browser, or monaco-languageclient).
// Send `initialize` with workspaceFolders naming the root URI the files live
// under, then nlp/workspaceFiles with those files. The URIs are the page's to
// choose -- they only have to sit under a workspace folder.
//
// Engine diagnostics are not here, as they are not in dist/server.js: they read
// what an engine run wrote, and neither process runs the engine
// (src/language/engineDiagnostics.ts).

import {
	createConnection, BrowserMessageReader, BrowserMessageWriter, ProposedFeatures,
} from "vscode-languageserver/browser";
import { startServer } from "./serverCore";
import { MemoryFiles, acceptWorkspaceFiles } from "./memoryFiles";

// The worker's own global scope is both ends of the pipe. Typed through the
// reader's constructor, so this file typechecks under the extension's tsconfig
// (DOM lib) and tsconfig.browser.json (webworker lib) alike.
type WorkerPort = ConstructorParameters<typeof BrowserMessageReader>[0];
const port = self as unknown as WorkerPort;

const connection = createConnection(
	ProposedFeatures.all, new BrowserMessageReader(port), new BrowserMessageWriter(port));
const files = new MemoryFiles();
const server = startServer(connection, files);
acceptWorkspaceFiles(connection, files, server);
server.listen();
