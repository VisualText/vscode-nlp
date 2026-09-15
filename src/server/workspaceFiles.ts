// Where the language server's workspace index gets its files.
//
// The index needs every .nlp/.pat/.kbb file under the workspace roots, and it
// used to walk the disk for them itself -- which tied the whole server to Node.
// Behind this interface the walk is one source (nodeFiles.ts, for dist/server.js)
// and a map the page fills is another (memoryFiles.ts, for dist/browserServer.js).
// The index and every handler are the same code over both.
//
// PURE MODULE: no Node, no DOM, no 'vscode'.

export interface WorkspaceFiles {
	// Every indexable file under the given root URIs, as URI strings.
	list(rootUris: string[]): Promise<string[]>;
	// A file's text, or undefined when it is not there.
	read(uri: string): Promise<string | undefined>;
}

const INDEXED_EXT = [".nlp", ".pat", ".kbb"];

export function isIndexedName(name: string): boolean {
	const lower = name.toLowerCase();
	return INDEXED_EXT.some((ext) => lower.endsWith(ext));
}

// Directories never worth indexing. node_modules is obvious; <text>_log/ holds
// engine output (a -DEV run writes one .kbb per pass into it) and output/ is
// where the engine drops trees and logs. An analyzer run writes thousands of
// files there, and re-indexing them stalls the server.
export function isSkippedDir(name: string): boolean {
	return name === "node_modules" || name === ".git" || name === "output" || name.endsWith("_log");
}

// Cap the file count the way the old findFiles(..., 5000) call did, so a stray
// huge tree cannot wedge startup.
export const MAX_FILES = 5000;
