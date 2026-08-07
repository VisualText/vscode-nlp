// Launcher for the VS Code integration suite.
//
// This half runs in ordinary Node. It downloads a VS Code build (cached under
// .vscode-test/), starts it with this extension loaded from source, and points
// it at ./suite/index, which runs inside the extension host where the `vscode`
// module actually exists. Run via: npm run test:integration
//
// The other three harnesses (test:format, test:language, test:treeview) cover
// the pure engines with plain Node and deliberately exclude every file that
// imports `vscode`. This one covers exactly that excluded layer: activation,
// command registration, and provider wiring.

import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { runTests } from "@vscode/test-electron";

// Running this from VS Code's integrated terminal inherits the extension host's
// environment, and ELECTRON_RUN_AS_NODE=1 in it makes the VS Code we launch
// behave as a bare Node process: it rejects every VS Code flag with "bad option"
// -- including the --extensionTestsPath that test-electron itself passes -- and
// treats the workspace path as a script to execute. Strip the inherited markers
// so the harness behaves the same from any terminal.
function unsetHostEnvironment(): void {
	delete process.env.ELECTRON_RUN_AS_NODE;
	for (const key of Object.keys(process.env)) {
		if (key.startsWith("VSCODE_")) delete process.env[key];
	}
}

async function main(): Promise<void> {
	unsetHostEnvironment();

	// A scratch folder opened as the workspace. VisualText reads and writes
	// per-workspace state, so handing it a throwaway directory keeps a test run
	// from touching whatever the developer happens to have open.
	const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-itest-"));

	try {
		await runTests({
			extensionDevelopmentPath: path.resolve(__dirname, "../../"),
			extensionTestsPath: path.resolve(__dirname, "./suite/index"),
			launchArgs: [workspace],
		});
	} catch (err) {
		console.error("\nIntegration tests failed:", err instanceof Error ? err.message : err);
		process.exitCode = 1;
	}
}

main();
