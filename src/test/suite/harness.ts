// Assertions for the integration suite.
//
// Deliberately hand-rolled, in the same shape as src/language/langTest.ts and
// src/treeview/treeTest.ts. A framework would buy little here -- the suite is a
// flat list of checks -- and the obvious candidate, mocha, depends on versions
// of diff and serialize-javascript that carry open advisories.

let passed = 0;
let failed = 0;

export function check(name: string, cond: boolean, detail?: string): void {
	if (cond) {
		passed++;
	} else {
		failed++;
		console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
	}
}

export function eq<T>(name: string, actual: T, expected: T): void {
	check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Report a check that could not be attempted, rather than letting it pass by
// omission. A suite that silently skips half its assertions looks identical to
// one that passes them.
export function unreachable(name: string, why: string): void {
	check(name, false, `could not run — ${why}`);
}

export function counts(): { passed: number; failed: number } {
	return { passed, failed };
}
