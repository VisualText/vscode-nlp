// Paths inside .nlm mod files. PURE: no 'vscode' import.
//
// A mod file bundles analyzer files under "<modfile kb\user\x.dict>" headers.
// The format was written on Windows: headers use backslashes, and the code
// classified paths by looking for "\kb\user\", "\spec\" and "\input\". On macOS
// and Linux no path contains those, so every section was "unknown" -- its pass
// never inserted into the sequence -- and path.join kept the backslashes, writing
// a file literally named "kb\user\x.dict".

export type ModSection = "kb" | "spec" | "input";

// The segments of a header path, whichever separator it was written with.
export function modParts(relPath: string): string[] {
	return relPath.split(/[\\/]+/).filter((p) => p.length);
}

// Which analyzer folder a path (relative, as in a header, or absolute) belongs to.
export function modSection(anyPath: string): ModSection | undefined {
	const p = "/" + modParts(anyPath).join("/").toLowerCase() + "/";
	if (p.includes("/kb/user/")) return "kb";
	if (p.includes("/spec/")) return "spec";
	if (p.includes("/input/")) return "input";
	return undefined;
}

// The path a header records for a file in an analyzer folder. Always written
// with backslashes, so a mod file made anywhere still loads in older versions,
// which only understood those.
export function modHeaderPath(dir: string, name: string): string {
	return [...modParts(dir), name].join("\\");
}
