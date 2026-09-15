// The language server's files in a browser: the ones the page hands over.
//
// A Web Worker has no disk to walk. The page running dist/browserServer.js
// already has the analyzer's files -- it fetched them to show them -- so it sends
// them with the nlp/workspaceFiles notification, and the index reads this map
// instead of a directory. Files outside the workspace roots, and under output/,
// *_log/ and the other skipped directories, are left out exactly as the disk walk
// leaves them out, so one analyzer indexes the same way in both.
//
// PURE MODULE: no Node, no DOM, no 'vscode'.

import type { Connection } from "vscode-languageserver";
import { WorkspaceFiles, isIndexedName, isSkippedDir, MAX_FILES } from "./workspaceFiles";
import type { StartedServer } from "./serverCore";

// The notification a page sends to give the server its files.
export const WORKSPACE_FILES = "nlp/workspaceFiles";

export interface WorkspaceFileEntry {
	uri: string;
	text: string;
}

export interface WorkspaceFilesParams {
	// Files to add, or to replace when the URI is already known.
	files?: WorkspaceFileEntry[];
	// URIs to forget.
	removed?: string[];
	// Forget every file first: a different analyzer, or a different bundle of it.
	replace?: boolean;
}

// The path of `uri` below `root`, split into segments -- or undefined when the URI
// is not under that root at all.
function segmentsUnder(uri: string, root: string): string[] | undefined {
	const base = root.endsWith("/") ? root : root + "/";
	return uri.startsWith(base) ? uri.slice(base.length).split("/") : undefined;
}

export class MemoryFiles implements WorkspaceFiles {
	private readonly texts = new Map<string, string>();

	// Apply one notification. Returns which URIs now have new text and which are gone.
	apply(params: WorkspaceFilesParams): { changed: string[]; removed: string[] } {
		const gone = new Set<string>();
		if (params.replace) {
			for (const uri of this.texts.keys()) gone.add(uri);
			this.texts.clear();
		}
		for (const uri of params.removed ?? []) {
			if (this.texts.delete(uri)) gone.add(uri);
		}
		const changed: string[] = [];
		for (const f of params.files ?? []) {
			if (typeof f?.uri !== "string" || typeof f?.text !== "string") continue;
			this.texts.set(f.uri, f.text);
			gone.delete(f.uri);
			changed.push(f.uri);
		}
		return { changed, removed: [...gone] };
	}

	async list(rootUris: string[]): Promise<string[]> {
		const out: string[] = [];
		for (const uri of this.texts.keys()) {
			if (out.length >= MAX_FILES) break;
			for (const root of rootUris) {
				const segs = segmentsUnder(uri, root);
				if (!segs) continue;
				if (isIndexedName(segs[segs.length - 1]) && !segs.slice(0, -1).some(isSkippedDir)) {
					out.push(uri);
				}
				break;
			}
		}
		return out;
	}

	async read(uri: string): Promise<string | undefined> {
		return this.texts.get(uri);
	}
}

// Wire nlp/workspaceFiles into a started server. Kept apart from
// browserServer.ts so the tests drive exactly this code.
export function acceptWorkspaceFiles(connection: Connection, files: MemoryFiles, server: StartedServer): void {
	connection.onNotification(WORKSPACE_FILES, async (params: WorkspaceFilesParams) => {
		const { changed, removed } = files.apply(params ?? {});
		if (params?.replace) {
			await server.index.rebuild();
		} else {
			const indexable = new Set(await files.list(server.index.rootUris));
			for (const uri of removed) server.index.removeFile(uri);
			for (const uri of changed) {
				if (indexable.has(uri)) await server.index.indexUri(uri);
				else server.index.removeFile(uri);
			}
		}
		// Unknown-function warnings depend on what the index knows.
		server.refreshDiagnostics();
	});
}
