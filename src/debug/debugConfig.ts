// VSCode wiring for the NLP++ debuggers.
//
// This is the ONLY file in src/debug that imports 'vscode'. The sessions
// themselves and their entry point are plain Node, so both debuggers can be
// driven from any DAP-speaking editor.
//
// Two jobs: fill in a launch config from the analyzer the user currently has
// open (so F5 works with no .vscode/launch.json at all), and tell VSCode how to
// start the adapter process -- including which of the two modes to run.

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { visualText } from "../visualText";

const DEBUG_TYPE = "nlpxx";

// Rule-level debugging needs the engine's -DEBUG server, added in 3.9.0.
const MIN_LIVE_ENGINE = "3.9.0";

function compareVersions(a: string, b: string): number {
	const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
	const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d !== 0) return d;
	}
	return 0;
}

class NlpConfigurationProvider implements vscode.DebugConfigurationProvider {
	// Offered when the user picks "create a launch.json" for NLP++.
	provideDebugConfigurations(): vscode.DebugConfiguration[] {
		return [
			{
				type: DEBUG_TYPE,
				request: "launch",
				name: "NLP++: replay last analyzer run",
				mode: "replay",
				analyzer: "${command:nlp.currentAnalyzerDir}",
				stopOnEntry: true,
			},
			{
				type: DEBUG_TYPE,
				request: "launch",
				name: "NLP++: debug rules (live)",
				mode: "live",
				analyzer: "${command:nlp.currentAnalyzerDir}",
				input: "${command:nlp.currentTextFile}",
				stopOnEntry: true,
			},
		];
	}

	// Called for every launch, including F5 with no launch.json (which arrives as
	// an empty config). Fill in whatever the user left out from the current
	// analyzer so the common case needs no configuration at all.
	resolveDebugConfiguration(
		_folder: vscode.WorkspaceFolder | undefined,
		config: vscode.DebugConfiguration,
	): vscode.DebugConfiguration | undefined {
		if (!config.type) {
			config.type = DEBUG_TYPE;
			config.request = "launch";
			config.name = "NLP++: replay last analyzer run";
			config.mode = "replay";
			config.stopOnEntry = true;
		}
		// Attaching only makes sense for the live debugger -- there is no running
		// engine to attach to in a replay.
		if (config.request === "attach") config.mode = "live";
		else config.mode = config.mode === "live" ? "live" : "replay";

		if (config.request === "attach") {
			if (!config.analyzer && visualText.analyzer?.isLoaded()) {
				config.analyzer = visualText.analyzer.getAnalyzerDirectory().fsPath;
			}
			if (!config.port) {
				void vscode.window.showErrorMessage(
					"Attaching needs the port the engine was started with (nlp ... -DEBUG <port>).");
				return undefined;
			}
			return config;
		}

		if (!config.analyzer) {
			if (!visualText.analyzer || !visualText.analyzer.isLoaded()) {
				void vscode.window.showErrorMessage(
					"No analyzer is open. Open one in the Analyzers view, then start debugging.");
				return undefined;
			}
			config.analyzer = visualText.analyzer.getAnalyzerDirectory().fsPath;
		}

		if (config.mode !== "live") return config;

		// ---- live mode needs an engine and an input file ----------------------

		if (!config.enginePath) {
			config.enginePath = path.join(
				visualText.engineDirectory().fsPath,
				process.platform === "win32" ? "nlp.exe" : "nlp");
		}
		if (!fs.existsSync(config.enginePath)) {
			void vscode.window.showErrorMessage(
				`NLP++ engine not found at ${config.enginePath}. Run the updater to install it.`);
			return undefined;
		}
		if (!config.workDir) {
			config.workDir = visualText.engineDirectory().fsPath;
		}

		// The engine must be new enough to have the -DEBUG server at all. Without
		// this check the failure is a connection timeout, which says nothing about
		// the actual cause.
		const version = visualText.engineVersion;
		if (version && compareVersions(version, MIN_LIVE_ENGINE) < 0) {
			void vscode.window.showErrorMessage(
				`Live rule debugging needs NLP++ engine ${MIN_LIVE_ENGINE} or later; ` +
				`this one is ${version}. Run the updater, or use "mode": "replay".`);
			return undefined;
		}

		if (!config.input) {
			const active = vscode.window.activeTextEditor?.document.uri.fsPath;
			// A text file open in the editor is the obvious thing to run; anything
			// under the analyzer's input/ tree qualifies.
			if (active && active.toLowerCase().includes(`${path.sep}input${path.sep}`)) {
				config.input = active;
			}
		}
		if (!config.input || !fs.existsSync(config.input)) {
			void vscode.window.showErrorMessage(
				"Live rule debugging needs a text file to run. Open one from the TEXT view, " +
				"or set \"input\" in your launch configuration.");
			return undefined;
		}
		return config;
	}
}

class NlpDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
	constructor(private readonly ctx: vscode.ExtensionContext) { }

	createDebugAdapterDescriptor(
		session: vscode.DebugSession,
	): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		const adapter = this.ctx.asAbsolutePath(path.join("dist", "debugAdapter.js"));
		// The mode has to be decided here, not in the launch request: DAP settles
		// capabilities at `initialize`, and only the replay session can step back.
		const args = session.configuration.mode === "live" ? [adapter, "--live"] : [adapter];
		// Its own process, like the language server: a crash in the adapter must
		// not take the extension host with it.
		return new vscode.DebugAdapterExecutable("node", args);
	}
}

export function registerDebugger(ctx: vscode.ExtensionContext): void {
	ctx.subscriptions.push(
		vscode.debug.registerDebugConfigurationProvider(DEBUG_TYPE, new NlpConfigurationProvider()),
		vscode.debug.registerDebugAdapterDescriptorFactory(DEBUG_TYPE, new NlpDebugAdapterFactory(ctx)),
		// Referenced by the generated launch.json above so the config stays
		// readable rather than hard-coding absolute paths.
		vscode.commands.registerCommand("nlp.currentAnalyzerDir", () =>
			visualText.analyzer?.isLoaded() ? visualText.analyzer.getAnalyzerDirectory().fsPath : ""),
		vscode.commands.registerCommand("nlp.currentTextFile", () =>
			visualText.analyzer?.getTextPath()?.fsPath ?? ""),
	);
}
