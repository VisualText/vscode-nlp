// Entry point loaded by VS Code inside the extension host.
//
// @vscode/test-electron requires this module to export `run()`. Resolving means
// the suite passed; throwing means it failed, and the launcher turns that into a
// non-zero exit code.

import { counts } from "./harness";
import {
	activationTests,
	commandTests,
	languageTests,
	providerTests,
} from "./extension.test";

export async function run(): Promise<void> {
	const groups: Array<[string, () => Promise<void>]> = [
		["activation", activationTests],
		["commands", commandTests],
		["languages", languageTests],
		["providers", providerTests],
	];

	for (const [name, fn] of groups) {
		try {
			await fn();
		} catch (err) {
			// A group that throws would otherwise take the whole run down with a
			// stack trace and no tally of what had already passed.
			console.error(`  FAIL: ${name} group threw — ${err instanceof Error ? err.stack : String(err)}`);
			throw new Error(`integration group "${name}" threw`);
		}
	}

	const { passed, failed } = counts();
	console.log(`\nintegration tests: ${passed} passed, ${failed} failed\n`);

	if (failed > 0) {
		throw new Error(`${failed} integration test${failed === 1 ? "" : "s"} failed`);
	}
}
