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

// Two pass files in the workspace, so the cross-pass features have something
// real to resolve against.
//
// Definition, references and rename all go through nlpWorkspaceIndex, which
// scans the workspace for **/*.{nlp,pat,kbb} -- it does not require an analyzer
// directory layout, so two files on disk are the whole fixture. They must exist
// before VS Code starts, since the index builds from what findFiles sees.
//
// FIXTURE_RULE is declared in the first and used in the second: a rule head is
// `_name <- ... @@` inside an @RULES region, so the occurrence in pass two is a
// reference rather than a second declaration.
export const FIXTURE_RULE = "_fixtureSharedRule";
export const FIXTURE_DECL_FILE = "pass1_declares.nlp";
export const FIXTURE_REF_FILE = "pass2_references.nlp";

function writeCrossPassFixture(dir: string): void {
	fs.writeFileSync(
		path.join(dir, FIXTURE_DECL_FILE),
		`@NODES _ROOT\n\n@RULES\n${FIXTURE_RULE} <- _xALPHA @@\n`,
		"utf8"
	);
	fs.writeFileSync(
		path.join(dir, FIXTURE_REF_FILE),
		`@NODES _ROOT\n\n@RULES\n_fixtureCaller <- ${FIXTURE_RULE} @@\n`,
		"utf8"
	);
}

async function main(): Promise<void> {
	unsetHostEnvironment();

	// A scratch folder opened as the workspace. VisualText reads and writes
	// per-workspace state, so handing it a throwaway directory keeps a test run
	// from touching whatever the developer happens to have open.
	const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-itest-"));
	writeCrossPassFixture(workspace);

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
