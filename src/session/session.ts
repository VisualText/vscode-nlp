// Pure helpers for what the extension remembers between analyzers (#131, #126).
//
// PURE MODULE: no 'vscode' import, so it runs under `npm run test:session`.
// Paths are plain strings; callers convert to and from vscode.Uri.

import * as path from "path";

// Windows paths compare case-insensitively, and the editor and the filesystem
// disagree about drive-letter case, so every comparison goes through this.
function norm(p: string): string {
	const n = path.normalize(p).replace(/[\\/]+$/, "");
	return process.platform === "win32" ? n.toLowerCase() : n;
}

// True when `file` lies inside `dir` (not `dir` itself).
export function isInside(dir: string, file: string): boolean {
	if (!dir || !file) return false;
	const rel = path.relative(norm(dir), norm(file));
	return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

// The files from `open` that belong to the analyzer at `dir`, as paths relative
// to it (so an analyzer that is moved or copied keeps its list), in order,
// without duplicates.
export function analyzerFiles(dir: string, open: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const file of open) {
		if (!isInside(dir, file)) continue;
		const rel = path.relative(dir, file);
		const key = norm(rel);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(rel);
	}
	return out;
}

// Most-recently-used list: `item` moves to the front, duplicates go, and the
// list is capped at `max`.
export function pushRecent(list: string[], item: string, max = 10): string[] {
	const key = norm(item);
	return [item, ...list.filter((p) => norm(p) !== key)].slice(0, max);
}

// True when `a` and `b` name the same directory.
export function samePath(a: string, b: string): boolean {
	return !!a && !!b && norm(a) === norm(b);
}
