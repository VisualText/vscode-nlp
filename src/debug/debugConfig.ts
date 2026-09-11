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

// An unset Uri stringifies to a lone separator ("\\" on Windows), which is
// truthy and therefore passed every plain `if (path)` check while naming no
// file. Anything shorter than a drive-qualified path is treated as unset.
function usableFile(p: string | undefined): boolean {
	return typeof p === "string" && p.trim().length > 1 && fs.existsSync(p);
}

// Under the analyzer's input/ tree. Checked with both separators: a path can
// reach here from a launch config or a Uri, and those do not agree on Windows.
function isUnderInput(p: string): boolean {
	const lower = p.toLowerCase().split("\\").join("/");
	return lower.includes("/input/");
}

/**
 * What "create a launch.json file" writes.
 *
 * MUST match `contributes.debuggers[0].initialConfigurations` in
 * package.json, which VS Code uses for the same purpose when the extension
 * has not been activated yet. Two copies of one list is how they drift, so an
 * integration test compares them.
 */
export const SEEDED_CONFIGURATIONS: vscode.DebugConfiguration[] = [
		{
			type: DEBUG_TYPE,
			request: "launch",
			name: "NLP++: debug (live)",
			mode: "live",
			analyzer: "${command:nlp.currentAnalyzerDir}",
			input: "${command:nlp.currentTextFile}",
			stopOnEntry: true,
			stopOnRuleFailure: false,
		},
		{
			type: DEBUG_TYPE,
			request: "launch",
			name: "NLP++: debug (replay)",
			mode: "replay",
			analyzer: "${command:nlp.currentAnalyzerDir}",
			stopOnEntry: true,
		},
		{
			type: DEBUG_TYPE,
			request: "attach",
			name: "NLP++: attach (live)",
			mode: "live",
			analyzer: "${command:nlp.currentAnalyzerDir}",
			port: 9777,
		},
	];;

class NlpConfigurationProvider implements vscode.DebugConfigurationProvider {
	/**
	 * What "create a launch.json file" writes. Kept in step with the
	 * `initialConfigurations` in package.json, which VS Code uses for the same
	 * purpose when the extension has not been activated yet.
	 *
	 * LIVE COMES FIRST, deliberately: VS Code runs the first configuration in
	 * the file when the user presses F5, and "debug my analyzer" means the live
	 * debugger. Seeding replay first handed people a session that reads the
	 * .tree dumps of a PREVIOUS run -- so it needs one to have happened, steps
	 * by pass rather than by rule, and cannot stop on a breakpoint in an @POST
	 * at all. Setting a breakpoint, pressing the button and having nothing
	 * happen is indistinguishable from the debugger being broken.
	 */
	provideDebugConfigurations(): vscode.DebugConfiguration[] {
		// Copied so an editor writing into the returned objects cannot mutate ours.
		return SEEDED_CONFIGURATIONS.map((c) => ({ ...c }));
	}
	// Called for every launch, including F5 with no launch.json (which arrives as
	// an empty config). Fill in whatever the user left out from the current
	// analyzer so the common case needs no configuration at all.
	resolveDebugConfiguration(
		_folder: vscode.WorkspaceFolder | undefined,
		config: vscode.DebugConfiguration,
	): vscode.DebugConfiguration | undefined {
		// An empty config is F5 with no launch.json. Live, not replay: replay
		// reads the .tree dumps of a PREVIOUS run, so it needs one to have
		// happened, and it cannot honour a breakpoint inside an @POST. Someone
		// who has set a breakpoint and pressed Start means the live debugger.
		if (!config.type) {
			config.type = DEBUG_TYPE;
			config.request = "launch";
			config.name = "NLP++: debug (live)";
			config.mode = "live";
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

		// Which text file to run, in order of what the user most likely meant.
		//
		// The first source is the one that was missing: the analyzer's CURRENT
		// text file, which is exactly what picking a file in the TEXT view sets.
		// Without it, choosing a file there and pressing F5 failed -- the only
		// thing consulted was the active editor, and while setting a breakpoint
		// that is the .nlp pass file, not a text file.
		if (!usableFile(config.input)) {
			config.input = undefined;
			const chosen = visualText.analyzer?.getTextPath()?.fsPath;
			if (usableFile(chosen)) config.input = chosen;
		}
		if (!config.input) {
			// Then an editor tab, but only one under the analyzer's input/ tree --
			// otherwise F5 from a pass file would try to analyze the pass file.
			const active = vscode.window.activeTextEditor?.document.uri.fsPath;
			if (usableFile(active) && isUnderInput(active as string)) config.input = active;
		}
		if (!config.input) {
			// Say what was looked for. "Open one from the TEXT view" was unhelpful
			// to someone who had just done exactly that.
			void vscode.window.showErrorMessage(
				"Live rule debugging needs a text file to run, and none was found. " +
				"Select one in the TEXT view (that sets the analyzer's current text file), " +
				"or set \"input\" to a path in your launch configuration.");
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
		// One click, no launch.json, no Run and Debug view. Everything this
		// leaves out -- the analyzer, the text file, the engine, the port -- is
		// filled in by resolveDebugConfiguration from what is currently
		// selected, which is the same path F5 takes with no launch.json.
		//
		// Worth having even though VS Code offers its own way in: that way is
		// the Run and Debug view, and an NLP++ author has no reason to have ever
		// opened it. The Text view is where they already are.
		vscode.commands.registerCommand("textView.debugAnalyzer", async () => {
			const started = await vscode.debug.startDebugging(
				vscode.workspace.workspaceFolders?.[0],
				{
					type: DEBUG_TYPE,
					request: "launch",
					name: "NLP++: debug (live)",
					mode: "live",
					stopOnEntry: true,
				} as vscode.DebugConfiguration);
			// startDebugging returns false when the resolver refused; it has
			// already said why, so do not pile a second message on top.
			return started;
		}),
		// Referenced by the generated launch.json above so the config stays
		// readable rather than hard-coding absolute paths.
		vscode.commands.registerCommand("nlp.currentAnalyzerDir", () =>
			visualText.analyzer?.isLoaded() ? visualText.analyzer.getAnalyzerDirectory().fsPath : ""),
		// Empty rather than a lone separator when no text file is set, so a
		// launch config substituting this gets a falsy value the resolver can
		// recognise instead of a path that merely fails to exist.
		vscode.commands.registerCommand("nlp.currentTextFile", () => {
			const p = visualText.analyzer?.getTextPath()?.fsPath;
			return usableFile(p) ? (p as string) : "";
		}),
	);
}
