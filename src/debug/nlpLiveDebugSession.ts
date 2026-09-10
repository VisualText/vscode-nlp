// NLP++ live debugger: a Debug Adapter Protocol session over a running engine.
//
// No 'vscode' import -- this runs as its own process (see debugAdapter.ts).
//
// HOW THIS DIFFERS FROM THE REPLAY SESSION. nlpDebugSession.ts steps over the
// .tree dumps of a finished run: every state is on disk, so it can move freely
// in both directions but only ever sees pass boundaries. This one drives a live
// nlp.exe stopped inside its rule-matching loop (engine 3.9.0, -DEBUG <port>),
// so it can stop between individual rule attempts and see a rule that failed and
// how far it got -- but it is forward-only, because the engine cannot un-run.
//
// The two are offered as `mode: "replay"` and `mode: "live"` on the same launch
// type rather than being merged: their capabilities genuinely differ, and a
// single session that silently lost Step Back depending on a config value would
// be worse than two honest ones.
//
// STEP MAPPING. NLP++ has no call stack to step into, so the three step buttons
// are mapped to the three things a rule debugger can actually do:
//
//   Step Over  (F10)       -> the next rule the engine tries
//   Step Into  (F11)       -> the next rule that MATCHES (skips the misses)
//   Step Out   (Shift+F11) -> the start of the next pass
//
// This is documented in the launch snippet and in the frame names, because it is
// a convention rather than something a user would guess.

import {
	LoggingDebugSession, InitializedEvent, TerminatedEvent, StoppedEvent,
	OutputEvent, Thread, StackFrame, Scope, Source, Handles,
	Breakpoint,
} from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import * as fs from "fs";
import * as path from "path";
import * as net from "net";
import {
	EngineClient, EngineStop, EngineNode, EngineRule, ResumeCommand,
} from "./engineClient";
import { parseSequence, sequencePassNames } from "../trace/traceModel";

const THREAD_ID = 1;

export interface NlpLiveLaunchArguments extends DebugProtocol.LaunchRequestArguments {
	analyzer: string;      // analyzer directory (holds spec/ and input/)
	input: string;         // the text file to run
	enginePath: string;    // nlp.exe / nlp
	workDir: string;       // engine working directory (-WORK)
	port?: number;         // debug port; a free one is chosen when absent
	stopOnEntry?: boolean;
	stopOnRuleFailure?: boolean; // also stop on every rule that fails
	engineArgs?: string[];
}

// Attaching skips the spawn: the engine is already running under -DEBUG <port>,
// started by hand or by a script. The analyzer directory is still needed, to map
// breakpoint source files to the pass numbers the engine expects.
export interface NlpLiveAttachArguments extends DebugProtocol.AttachRequestArguments {
	analyzer: string;
	port: number;
	input?: string;              // only for the text preview in the tree view
	stopOnRuleFailure?: boolean;
}

type VariableRef =
	| { kind: "pass" }
	| { kind: "rule" }
	| { kind: "node" }
	| { kind: "tree" }
	| { kind: "engineNode"; node: EngineNode };

export class NlpLiveDebugSession extends LoggingDebugSession {
	private client = new EngineClient();
	private variableHandles = new Handles<VariableRef>();
	private currentStop: EngineStop | undefined;
	private analyzer = "";
	private inputText = "";
	// Lowercased absolute pass-file path -> pass number, from the analyzer.seq.
	// Lowercased because DAP hands back whatever case the editor used and Windows
	// does not care, but the ORIGINAL casing has to be kept too -- it is what gets
	// sent back as the stack frame's source, and a lowercased path fails to open
	// on a case-sensitive filesystem.
	private passOfSource = new Map<string, number>();
	private sourceOfPass = new Map<number, string>();
	// Breakpoints the client set before we were connected to the engine.
	private pendingBreakpoints = new Map<number, number[]>();
	private launched = false;
	private attached = false;
	private breakpointSeq = 1;

	public constructor() {
		super("nlp-live-debug.log");
		this.setDebuggerLinesStartAt1(true);
		this.setDebuggerColumnsStartAt1(true);
	}

	protected initializeRequest(
		response: DebugProtocol.InitializeResponse,
		_args: DebugProtocol.InitializeRequestArguments,
	): void {
		response.body = response.body ?? {};
		response.body.supportsConfigurationDoneRequest = true;
		response.body.supportsEvaluateForHovers = true;
		response.body.supportsTerminateRequest = true;
		// Deliberately absent: supportsStepBack. A live engine cannot un-run a
		// rule, and advertising it would put a Step Back button on the toolbar
		// that could only ever fail. The replay session is where that lives.
		response.body.supportsRestartRequest = false;

		this.sendResponse(response);
		this.sendEvent(new InitializedEvent());
	}

	// ---- launch -------------------------------------------------------------

	protected async launchRequest(
		response: DebugProtocol.LaunchResponse,
		args: NlpLiveLaunchArguments,
	): Promise<void> {
		for (const [name, value] of [["analyzer", args.analyzer], ["input", args.input],
			["enginePath", args.enginePath]] as Array<[string, string]>) {
			if (!value || !fs.existsSync(value)) {
				this.sendErrorResponse(response, 2001, `${name} not found: ${value || "(not set)"}`);
				return;
			}
		}

		this.analyzer = args.analyzer;
		this.loadSequence(args.analyzer);
		try {
			this.inputText = fs.readFileSync(args.input, "utf8");
		} catch {
			// Only the text preview in the variables view depends on this.
		}

		this.client.onOutput = (text) => this.sendEvent(new OutputEvent(text, "stdout"));
		this.client.onTerminated = () => this.sendEvent(new TerminatedEvent());

		const port = args.port && args.port > 0 ? args.port : await freePort();
		try {
			await this.client.start({
				enginePath: args.enginePath,
				analyzer: args.analyzer,
				input: args.input,
				workDir: args.workDir,
				port,
				extraArgs: args.engineArgs,
			});
		} catch (err) {
			this.sendErrorResponse(response, 2002,
				err instanceof Error ? err.message : String(err));
			return;
		}

		this.emit_(`Debugging ${path.basename(args.analyzer)} on ${path.basename(args.input)} ` +
			`(engine port ${port}).\n`);
		this.emit_("Step Over = next rule tried, Step Into = next rule that matches, " +
			"Step Out = next pass.\n\n");

		this.launched = true;
		if (args.stopOnRuleFailure) await this.client.stopOnFailure(true);
		// Breakpoints the client sent during configuration, before the engine was
		// up, are only now deliverable.
		for (const [pass, lines] of this.pendingBreakpoints) {
			await this.client.setBreakpoints(pass, lines);
		}
		this.pendingBreakpoints.clear();

		this.sendResponse(response);

		// The engine attaches already stopped at the first pass.
		try {
			this.currentStop = await this.client.nextStop();
		} catch {
			this.sendEvent(new TerminatedEvent());
			return;
		}
		if (args.stopOnEntry) this.announceStop();
		else await this.resume("continue");
	}

	// Attach to an engine already listening on `port`. Everything after the
	// connection is identical to launch -- the difference is only who started the
	// process, and therefore who gets to kill it (see disconnectRequest).
	protected async attachRequest(
		response: DebugProtocol.AttachResponse,
		args: NlpLiveAttachArguments,
	): Promise<void> {
		if (!args.analyzer || !fs.existsSync(args.analyzer)) {
			this.sendErrorResponse(response, 2003,
				`analyzer not found: ${args.analyzer || "(not set)"}`);
			return;
		}
		if (!args.port) {
			this.sendErrorResponse(response, 2004,
				"attach needs the port the engine was started with (nlp ... -DEBUG <port>).");
			return;
		}

		this.attached = true;
		this.loadSequence(args.analyzer);
		if (args.input) {
			try {
				this.inputText = fs.readFileSync(args.input, "utf8");
			} catch { /* only the text preview depends on this */ }
		}

		this.client.onOutput = (text) => this.sendEvent(new OutputEvent(text, "stdout"));
		this.client.onTerminated = () => this.sendEvent(new TerminatedEvent());

		try {
			await this.client.start({ port: args.port });
		} catch (err) {
			this.sendErrorResponse(response, 2005,
				err instanceof Error ? err.message : String(err));
			return;
		}

		this.emit_(`Attached to the engine on port ${args.port}.
`);
		this.launched = true;
		if (args.stopOnRuleFailure) await this.client.stopOnFailure(true);
		for (const [pass, lines] of this.pendingBreakpoints) {
			await this.client.setBreakpoints(pass, lines);
		}
		this.pendingBreakpoints.clear();
		this.sendResponse(response);

		// An engine we attached to is already sitting at a stop.
		try {
			this.currentStop = await this.client.nextStop();
			this.announceStop();
		} catch {
			this.sendEvent(new TerminatedEvent());
		}
	}

	// Pass number <- pass file, taken from the analyzer.seq the way the engine
	// numbers passes. Needed because DAP breakpoints arrive as a source path and
	// the engine wants a pass number.
	private loadSequence(analyzerDir: string): void {
		this.passOfSource.clear();
		this.sourceOfPass.clear();
		let text: string;
		try {
			text = fs.readFileSync(path.join(analyzerDir, "spec", "analyzer.seq"), "utf8");
		} catch {
			return;
		}
		const specDir = path.join(analyzerDir, "spec");
		for (const [num, name] of sequencePassNames(parseSequence(text))) {
			for (const ext of [".nlp", ".pat"]) {
				const file = path.join(specDir, name + ext);
				if (fs.existsSync(file)) {
					const resolved = path.resolve(file);
					this.passOfSource.set(resolved.toLowerCase(), num);
					this.sourceOfPass.set(num, resolved);
					break;
				}
			}
		}
	}

	// ---- breakpoints --------------------------------------------------------

	protected async setBreakPointsRequest(
		response: DebugProtocol.SetBreakpointsResponse,
		args: DebugProtocol.SetBreakpointsArguments,
	): Promise<void> {
		const sourcePath = args.source.path ?? "";
		const lines = args.breakpoints?.map((b) => b.line) ?? [];
		const pass = this.passOfSource.get(path.resolve(sourcePath).toLowerCase());

		if (pass === undefined) {
			// Not a pass in this analyzer's sequence, so the engine has no pass
			// number to hang it on. Say so rather than accepting it silently.
			response.body = {
				breakpoints: lines.map((line) => {
					const bp = new Breakpoint(false, line) as DebugProtocol.Breakpoint;
					bp.id = this.breakpointSeq++;
					bp.message = "This file is not a pass in the analyzer's sequence.";
					return bp;
				}),
			};
			this.sendResponse(response);
			return;
		}

		if (this.launched) await this.client.setBreakpoints(pass, lines);
		else this.pendingBreakpoints.set(pass, lines);

		// Verified means "the engine has been told about it". Unlike the replay
		// session we cannot say in advance whether the rule will fire -- that is
		// the whole point of running live.
		response.body = {
			breakpoints: lines.map((line) => {
				const bp = new Breakpoint(true, line) as DebugProtocol.Breakpoint;
				bp.id = this.breakpointSeq++;
				return bp;
			}),
		};
		this.sendResponse(response);
	}

	// ---- execution ----------------------------------------------------------

	private async resume(command: ResumeCommand): Promise<void> {
		this.variableHandles.reset();
		await this.client.resume(command);
		try {
			this.currentStop = await this.client.nextStop();
		} catch {
			this.sendEvent(new TerminatedEvent());
			return;
		}
		this.announceStop();
	}

	private announceStop(): void {
		const stop = this.currentStop;
		if (!stop) return;
		// DAP has no "a rule failed" reason, so failures arrive as a step stop
		// and the frame name carries the distinction.
		const reason =
			stop.reason === "breakpoint" ? "breakpoint" :
			stop.reason === "entry" ? "entry" : "step";
		this.sendEvent(new StoppedEvent(reason, THREAD_ID));
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse): void {
		this.sendResponse(response);
		void this.resume("continue");
	}

	protected nextRequest(response: DebugProtocol.NextResponse): void {
		this.sendResponse(response);
		void this.resume("stepRule");
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse): void {
		this.sendResponse(response);
		void this.resume("stepMatch");
	}

	protected stepOutRequest(response: DebugProtocol.StepOutResponse): void {
		this.sendResponse(response);
		void this.resume("stepPass");
	}

	protected disconnectRequest(
		response: DebugProtocol.DisconnectResponse,
		args: DebugProtocol.DisconnectArguments,
	): void {
		// Let the analyzer finish on its own if the user just detaches; kill it
		// only when they actually asked to stop it. An engine we attached to was
		// not ours to start, so it is not ours to kill either unless asked
		// explicitly -- the default there is to detach and leave it running.
		const kill = args.terminateDebuggee ?? !this.attached;
		if (kill) this.client.kill();
		else void this.client.detach();
		this.sendResponse(response);
	}

	protected terminateRequest(response: DebugProtocol.TerminateResponse): void {
		this.client.kill();
		this.sendResponse(response);
		this.sendEvent(new TerminatedEvent());
	}

	private emit_(text: string): void {
		this.sendEvent(new OutputEvent(text, "stdout"));
	}

	// ---- stack --------------------------------------------------------------

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
		response.body = { threads: [new Thread(THREAD_ID, "NLP++ analysis")] };
		this.sendResponse(response);
	}

	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse): void {
		const stop = this.currentStop;
		if (!stop) {
			response.body = { stackFrames: [], totalFrames: 0 };
			this.sendResponse(response);
			return;
		}

		const sourceFile = this.sourceForPass(stop.pass);
		const source = sourceFile ? new Source(path.basename(sourceFile), sourceFile) : undefined;
		const frames: DebugProtocol.StackFrame[] = [];

		// Frame 0: the rule attempt, when we are inside one. The name carries what
		// DAP's stop reason cannot: whether this rule matched or failed, and for a
		// failure how many elements matched before it gave up -- which is the
		// thing that says WHERE the rule stopped agreeing with the text.
		if (stop.line > 0) {
			let label = `rule at line ${stop.line}`;
			if (stop.reason === "matched") label += " — matched";
			else if (stop.reason === "failed") {
				label += stop.eltsMatched !== undefined
					? ` — failed after ${stop.eltsMatched} element${stop.eltsMatched === 1 ? "" : "s"}`
					: " — failed";
			}
			if (stop.node) label += `  [${stop.node}]`;
			frames.push(new StackFrame(1, label, source, stop.line));
		}

		// Frame 1: the pass. Passes run in sequence rather than calling each
		// other, so this is the bottom of a genuinely two-deep stack.
		const passFrame = new StackFrame(2, `Pass ${stop.pass}: ${this.passLabel(stop)}`,
			source, stop.line > 0 ? stop.line : 1);
		if (!source) passFrame.presentationHint = "subtle";
		frames.push(passFrame);

		response.body = { stackFrames: frames, totalFrames: frames.length };
		this.sendResponse(response);
	}

	private passLabel(stop: EngineStop): string {
		// The engine sends the pass's file name; the pass is known by its stem.
		if (!stop.passName) return `pass ${stop.pass}`;
		return path.basename(stop.passName).replace(/\.(nlp|pat)$/i, "");
	}

	private sourceForPass(pass: number): string | undefined {
		return this.sourceOfPass.get(pass);
	}

	// ---- variables ----------------------------------------------------------

	protected scopesRequest(response: DebugProtocol.ScopesResponse): void {
		response.body = {
			scopes: [
				new Scope("Rule", this.variableHandles.create({ kind: "rule" }), false),
				new Scope("Pass", this.variableHandles.create({ kind: "pass" }), false),
				new Scope("Current node", this.variableHandles.create({ kind: "node" }), false),
				new Scope("Parse tree", this.variableHandles.create({ kind: "tree" }), true),
			],
		};
		this.sendResponse(response);
	}

	protected async variablesRequest(
		response: DebugProtocol.VariablesResponse,
		args: DebugProtocol.VariablesArguments,
	): Promise<void> {
		const ref = this.variableHandles.get(args.variablesReference);
		let variables: DebugProtocol.Variable[] = [];

		if (ref && !this.client.isTerminated) {
			switch (ref.kind) {
				case "pass":
					variables = this.passVariables();
					break;
				case "rule":
					variables = this.ruleVariables(await this.client.rule());
					break;
				case "node": {
					const node = await this.client.node();
					variables = node ? this.nodeChildren(node) : [];
					break;
				}
				case "tree": {
					// One level at a time: the tree can be tens of thousands of
					// nodes, and the client only expands what it displays.
					const tree = await this.client.tree(1);
					variables = tree ? [this.nodeVariable(tree)] : [];
					break;
				}
				case "engineNode":
					variables = this.nodeChildren(ref.node);
					break;
			}
		}

		response.body = { variables };
		this.sendResponse(response);
	}

	private plain(name: string, value: string): DebugProtocol.Variable {
		return { name, value, variablesReference: 0 };
	}

	private passVariables(): DebugProtocol.Variable[] {
		const stop = this.currentStop;
		if (!stop) return [];
		const out = [
			this.plain("pass number", String(stop.pass)),
			this.plain("name", this.passLabel(stop)),
			this.plain("stopped because", stop.reason),
		];
		if (stop.ruleOrd > 0) {
			out.push(this.plain("rule # at this node", String(stop.ruleOrd)));
		}
		return out;
	}

	private ruleVariables(rule: EngineRule | undefined): DebugProtocol.Variable[] {
		const stop = this.currentStop;
		if (!rule) return [this.plain("(no rule)", "stopped at a pass boundary")];
		const out = [
			this.plain("line", String(rule.line)),
			this.plain("builds", rule.builds ?? "(nothing)"),
			this.plain("elements", rule.elements.map((e) => e.name).join(" ") || "(none)"),
		];
		// Pair the element list with how far the match got, so the two read
		// together: "3 elements, failed after 2" points at element 3.
		if (stop?.reason === "failed" && stop.eltsMatched !== undefined) {
			out.push(this.plain("matched before failing",
				`${stop.eltsMatched} of ${rule.elements.length}`));
			const next = rule.elements[stop.eltsMatched];
			if (next) out.push(this.plain("failed on element", next.name));
		}
		return out;
	}

	private nodeVariable(node: EngineNode): DebugProtocol.Variable {
		const expandable = (node.children && node.children.length > 0) || (node.childCount ?? 0) > 0;
		return {
			name: node.name,
			value: this.describeNode(node),
			variablesReference: expandable
				? this.variableHandles.create({ kind: "engineNode", node })
				: 0,
			namedVariables: node.children?.length ?? node.childCount ?? 0,
		};
	}

	private describeNode(node: EngineNode): string {
		const text = this.spanText(node);
		const flags: string[] = [];
		if (node.built) flags.push("built");
		else if (node.fired) flags.push("fired");
		const origin = node.passNum > 0 ? ` — pass ${node.passNum} line ${node.ruleLine}` : "";
		const suffix = flags.length ? ` [${flags.join(", ")}]` : "";
		return `${text} (${node.type})${origin}${suffix}`;
	}

	private spanText(node: EngineNode): string {
		if (!this.inputText.length || node.ustart < 0 || node.uend < node.ustart) return "";
		const raw = this.inputText.slice(node.ustart, node.uend + 1).replace(/\s+/g, " ").trim();
		if (!raw.length) return '""';
		return JSON.stringify(raw.length > 60 ? raw.slice(0, 57) + "..." : raw);
	}

	private nodeChildren(node: EngineNode): DebugProtocol.Variable[] {
		if (node.children && node.children.length) {
			return node.children.map((c) => this.nodeVariable(c));
		}
		if ((node.childCount ?? 0) > 0) {
			// The engine trimmed the walk at this depth. Rather than pretend the
			// node is a leaf, say what is there and how to get it.
			return [this.plain(`(${node.childCount} children)`,
				"expand the Parse tree scope to walk deeper")];
		}
		return [];
	}

	// ---- evaluate -----------------------------------------------------------

	protected async evaluateRequest(
		response: DebugProtocol.EvaluateResponse,
		args: DebugProtocol.EvaluateArguments,
	): Promise<void> {
		const expr = args.expression.trim();
		// The engine has no expression evaluator, so rather than invent one that
		// half-works, only the three things it can actually answer are accepted.
		if (expr === "rule" || expr === "node" || expr === "tree") {
			const ref = this.variableHandles.create({ kind: expr as "rule" | "node" | "tree" });
			response.body = { result: `<${expr}>`, variablesReference: ref };
			this.sendResponse(response);
			return;
		}
		this.sendErrorResponse(response, 2010,
			`The engine cannot evaluate expressions. Try "rule", "node" or "tree", ` +
			`or read the Variables pane.`);
	}
}

// Ask the OS for a free port by binding one and letting it go. There is a race
// between releasing it and the engine binding it, but it is the standard trick
// and the window is microseconds; an explicit `port` in the launch config avoids
// it entirely.
function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.once("error", reject);
		srv.listen(0, "127.0.0.1", () => {
			const addr = srv.address();
			const port = typeof addr === "object" && addr ? addr.port : 0;
			srv.close(() => (port ? resolve(port) : reject(new Error("no free port"))));
		});
	});
}
