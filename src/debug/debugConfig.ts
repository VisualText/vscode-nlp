// VSCode wiring for the NLP++ replay debugger.
//
// This is the ONLY file in src/debug that imports 'vscode'. The session itself
// (nlpDebugSession.ts) and its entry point (debugAdapter.ts) are plain Node, so
// the debugger can be driven from any DAP-speaking editor.
//
// Two jobs: fill in a launch config from the analyzer the user currently has
// open (so F5 works with no .vscode/launch.json at all), and tell VSCode how to
// start the adapter process.

import * as vscode from "vscode";
import * as path from "path";
import { visualText } from "../visualText";

const DEBUG_TYPE = "nlpxx";

class NlpConfigurationProvider implements vscode.DebugConfigurationProvider {
	// Offered when the user picks "create a launch.json" for NLP++.
	provideDebugConfigurations(): vscode.DebugConfiguration[] {
		return [{
			type: DEBUG_TYPE,
			request: "launch",
			name: "NLP++: replay last analyzer run",
			analyzer: "${command:nlp.currentAnalyzerDir}",
			stopOnEntry: true,
		}];
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
			config.stopOnEntry = true;
		}

		if (!config.analyzer) {
			if (!visualText.analyzer || !visualText.analyzer.isLoaded()) {
				void vscode.window.showErrorMessage(
					"No analyzer is open. Open one in the Analyzers view, run it once, then start debugging.");
				return undefined;
			}
			config.analyzer = visualText.analyzer.getAnalyzerDirectory().fsPath;
		}
		return config;
	}
}

class NlpDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
	constructor(private readonly ctx: vscode.ExtensionContext) { }

	createDebugAdapterDescriptor(): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		const adapter = this.ctx.asAbsolutePath(path.join("dist", "debugAdapter.js"));
		// Its own process, like the language server: a crash in the adapter must
		// not take the extension host with it.
		return new vscode.DebugAdapterExecutable("node", [adapter]);
	}
}

export function registerDebugger(ctx: vscode.ExtensionContext): void {
	ctx.subscriptions.push(
		vscode.debug.registerDebugConfigurationProvider(DEBUG_TYPE, new NlpConfigurationProvider()),
		vscode.debug.registerDebugAdapterDescriptorFactory(DEBUG_TYPE, new NlpDebugAdapterFactory(ctx)),
		// Referenced by the generated launch.json above so the config stays
		// readable rather than hard-coding an absolute path.
		vscode.commands.registerCommand("nlp.currentAnalyzerDir", () =>
			visualText.analyzer?.isLoaded() ? visualText.analyzer.getAnalyzerDirectory().fsPath : ""),
	);
}
