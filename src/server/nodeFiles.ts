// The language server's files under Node: a walk of the workspace folders on disk.
//
// This is what the workspace index did for itself before WorkspaceFiles existed
// (see workspaceFiles.ts for why it moved out). dist/server.js uses it; a browser
// cannot, which is the point of keeping it here and nowhere else.

import * as fs from "fs";
import * as path from "path";
import { URI } from "vscode-uri";
import { WorkspaceFiles, isIndexedName, isSkippedDir, MAX_FILES } from "./workspaceFiles";

function walk(dir: string, out: string[]): void {
	if (out.length >= MAX_FILES) return;
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return; // unreadable directory -- a partial index still helps
	}
	for (const entry of entries) {
		if (out.length >= MAX_FILES) return;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!isSkippedDir(entry.name)) walk(full, out);
		} else if (isIndexedName(entry.name)) {
			out.push(full);
		}
	}
}

export class NodeFiles implements WorkspaceFiles {
	async list(rootUris: string[]): Promise<string[]> {
		const paths: string[] = [];
		for (const root of rootUris) {
			const uri = URI.parse(root);
			// A folder that is not on this disk has nothing here to walk.
			if (uri.scheme !== "file") continue;
			walk(uri.fsPath, paths);
		}
		return paths.map((p) => URI.file(p).toString());
	}

	async read(uri: string): Promise<string | undefined> {
		try {
			return await fs.promises.readFile(URI.parse(uri).fsPath, "utf8");
		} catch {
			return undefined;
		}
	}
}
