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
	Breakpoint, BreakpointEvent,
} from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import * as fs from "fs";
import * as path from "path";
import * as net from "net";
import {
	EngineClient, EngineStop, EngineNode, EngineRule, EngineVar,
	EngineCollectElement, ResumeCommand,
} from "./engineClient";
import { parseSequence, sequencePassNames } from "../trace/traceModel";
import { declaredSymbols } from "../language/symbols";

const THREAD_ID = 1;

// Shown in place of a variable list when the engine predates the commands that
// serve them. Naming the version is the point: "(none)" would look like an
// analyzer with no variables, which is a very different problem to chase.
const OLD_ENGINE = "needs NLP++ engine 3.10.0 or later — run the updater";

// Same idea for breakpoints outside a rule. Said in full rather than as
// "unsupported", because the fix is a version away and the alternative reading
// -- that NLP++ cannot be stepped through statement by statement -- is wrong.
const OLD_ENGINE_MESSAGE =
	"Breakpoints in @CODE, @POST and @DECL need NLP++ engine 3.12.0 or later — " +
	"run the updater. This engine stops at rules and pass boundaries.";

export interface NlpLiveLaunchArguments extends DebugProtocol.LaunchRequestArguments {
	analyzer: string;      // analyzer directory (holds spec/ and input/)
	input: string;         // the text file to run
	enginePath: string;    // nlp.exe / nlp
	workDir: string;       // engine working directory (-WORK)
	port?: number;         // debug port; a free one is chosen when absent
	stopOnEntry?: boolean;
	stopOnRuleFailure?: boolean; // also stop on every rule that fails
	engineArgs?: string[];
	/**
	 * How many levels of parse tree to fetch at each stop. The engine walks the
	 * tree in one request, and a handle handed to the client holds the subtree it
	 * came with -- so this is also how deep the Variables pane can be expanded.
	 * Deeper costs a bigger reply at every stop; 5 covers the usual
	 * _ROOT / paragraph / sentence / phrase / token shape.
	 */
	treeDepth?: number;
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
	| { kind: "vars" }        // the L/S/X group
	| { kind: "locals" }
	| { kind: "suggested" }
	| { kind: "context" }
	| { kind: "globals" }
	| { kind: "collect" }     // the N() matched elements
	| { kind: "engineNode"; node: EngineNode }
	| { kind: "attributes"; node: EngineNode }
	| { kind: "wholeTree" };

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
	// Pass file -> the head line of each rule, and the line range it covers.
	// Built lazily per file, because breakpoints arrive one file at a time.
	private ruleSpans = new Map<string, Array<{ head: number; from: number; to: number }>>();
	// Breakpoints the client set before we were connected to the engine.
	private pendingBreakpoints = new Map<number, number[]>();
	private launched = false;
	private attached = false;
	private treeDepth = 5;
	private breakpointSeq = 1;

	/**
	 * Whether this engine stops on statements, from its capabilities reply.
	 * Undefined until the connection is up -- breakpoints arrive during
	 * configuration, before the engine is even started, so a statement
	 * breakpoint is accepted optimistically and withdrawn afterwards if the
	 * engine turns out to be older. Withdrawing one is a `breakpoint` event;
	 * silently never firing is not.
	 */
	private statementsSupported: boolean | undefined;
	/** Statement breakpoints reported as verified, in case they must be withdrawn. */
	private statementBreakpoints: DebugProtocol.Breakpoint[] = [];
	/**
	 * How many breakpoints stand in each source file. Kept because what should
	 * happen when the session starts depends on whether the user set any: with
	 * breakpoints, starting means run to them.
	 */
	private breakpointsPerSource = new Map<string, number>();

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
		if (args.treeDepth && args.treeDepth > 0) this.treeDepth = args.treeDepth;
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
		this.emit_("At a rule: Step Over = next rule tried, Step Into = next rule that " +
			"matches, Step Out = next pass.\n");
		this.emit_("In an @CODE, @POST or @DECL body the same buttons step by statement, " +
			"and Step Into enters a function.\n\n");

		// What this engine can do, before anything depends on it.
		this.statementsSupported = (await this.client.capabilities()).includes("statements");
		if (!this.statementsSupported) this.withdrawStatementBreakpoints();

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
		if (!args.stopOnEntry) {
			await this.resume("continue");
			return;
		}

		// "Stop on entry" means the first thing the ANALYZER does, not the first
		// thing the engine does.
		//
		// The engine's first stop is the boundary of pass 1, which in almost
		// every analyzer is a tokenizer built into the engine: no pass file to
		// open, no rule, no node, and no variables set yet, because nothing the
		// user wrote has run. A debugger that opens on a blank editor and six
		// empty panes reads as one that failed to start, and the only way to
		// find that out is to press Step and watch it fill in.
		//
		// A user who has set a breakpoint has already said where they want to
		// stop, and pressing Start should take them there. Stopping somewhere
		// else first is a step they did not ask for, in a file they were not
		// looking at, and it reads as the breakpoint having been ignored.
		if (this.anyBreakpoints()) {
			await this.resume("continue");
			return;
		}

		// With no breakpoints, run on to the first rule the analyzer tries, so
		// the session opens on something rather than on nothing.
		if (this.currentStop?.reason === "passStart") await this.resume("stepRule");
		else this.announceStop();
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
		// What this engine can do, before anything depends on it.
		this.statementsSupported = (await this.client.capabilities()).includes("statements");
		if (!this.statementsSupported) this.withdrawStatementBreakpoints();

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

		// Move each breakpoint onto the head of the rule that contains it.
		//
		// A rule spans several lines and the eye lands on whichever one names the
		// thing being looked for -- an element, usually, not the `_name <-`. But
		// the engine identifies a rule by its head line and reports no other, so
		// a breakpoint anywhere else used to be accepted and then never fire.
		const effective: number[] = [];
		const reported = lines.map((line) => {
			const head = this.ruleHeadFor(sourcePath, line);
			const bp = new Breakpoint(true, head ?? line) as DebugProtocol.Breakpoint;
			bp.id = this.breakpointSeq++;
			if (head === undefined) {
				// Outside every rule: an @CODE, @POST or @DECL region. Those are
				// ordinary imperative code and the engine stops on each statement
				// in them, so the line goes through exactly as written -- no
				// snapping, because here the line the user clicked IS the unit
				// that runs.
				if (this.statementsSupported === false) {
					bp.verified = false;
					bp.message = OLD_ENGINE_MESSAGE;
					return bp;
				}
				// The engine may not be up yet; see statementsSupported.
				effective.push(line);
				this.statementBreakpoints.push(bp);
				return bp;
			}
			effective.push(head);
			if (head !== line) bp.message = `Moved to line ${head}, where the rule starts.`;
			return bp;
		});

		// Deduped: several breakpoints inside one rule are one stop.
		const unique = [...new Set(effective)];
		this.breakpointsPerSource.set(path.resolve(sourcePath).toLowerCase(), unique.length);
		if (this.launched) await this.client.setBreakpoints(pass, unique);
		else this.pendingBreakpoints.set(pass, unique);

		response.body = { breakpoints: reported };
		this.sendResponse(response);
	}

	private anyBreakpoints(): boolean {
		for (const n of this.breakpointsPerSource.values()) if (n > 0) return true;
		return false;
	}

	/**
	 * Tell the client a statement breakpoint cannot be honoured after all.
	 *
	 * Only reachable against an engine older than 3.12: they were accepted while
	 * the connection was still coming up. A breakpoint that quietly never fires
	 * is the worst of the three outcomes, so it is withdrawn out loud.
	 */
	private withdrawStatementBreakpoints(): void {
		for (const bp of this.statementBreakpoints) {
			bp.verified = false;
			bp.message = OLD_ENGINE_MESSAGE;
			this.sendEvent(new BreakpointEvent("changed", bp));
		}
		if (this.statementBreakpoints.length) {
			this.emit_(OLD_ENGINE_MESSAGE + "\n");
			this.statementBreakpoints = [];
		}
	}

	// Where each rule in a pass file begins and ends, in 1-based lines.
	//
	// Needed because the engine identifies a rule by its HEAD line -- the
	// `_name <-` -- and that is the only line it ever reports. A breakpoint set
	// anywhere else inside the rule, which is where the eye naturally goes when
	// reading `_money <- _det total _prep _money`, was sent through verbatim and
	// simply never fired.
	//
	// Parsed with the same declaredSymbols() the outline and go-to-definition
	// use, so the debugger's idea of where a rule starts and ends cannot drift
	// from the editor's.
	private rulesIn(sourcePath: string): Array<{ head: number; from: number; to: number }> {
		const key = path.resolve(sourcePath).toLowerCase();
		const cached = this.ruleSpans.get(key);
		if (cached) return cached;

		const spans: Array<{ head: number; from: number; to: number }> = [];
		try {
			const text = fs.readFileSync(sourcePath, "utf8");
			// One line table for the file, rather than counting newlines per symbol.
			const starts: number[] = [0];
			for (let i = 0; i < text.length; i++) {
				if (text[i] === "\n") starts.push(i + 1);
			}
			const lineOf = (offset: number): number => {
				let lo = 0, hi = starts.length - 1;
				while (lo < hi) {
					const mid = (lo + hi + 1) >> 1;
					if (starts[mid] <= offset) lo = mid;
					else hi = mid - 1;
				}
				return lo + 1; // the engine and the editor both count from 1
			};
			for (const sym of declaredSymbols(text)) {
				if (sym.kind !== "rule") continue;
				spans.push({
					head: lineOf(sym.selStart),
					from: lineOf(sym.start),
					to: lineOf(sym.end),
				});
			}
		} catch {
			// Unreadable pass file: fall back to sending lines through unchanged.
		}
		this.ruleSpans.set(key, spans);
		return spans;
	}

	// The head line of the rule containing `line`, or undefined if it falls
	// outside every rule (an @CODE or @POST region, say).
	private ruleHeadFor(sourcePath: string, line: number): number | undefined {
		for (const r of this.rulesIn(sourcePath)) {
			if (line >= r.from && line <= r.to) return r.head;
		}
		return undefined;
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

	// The three step buttons mean different things depending on where the engine
	// is stopped, because an analyzer has two kinds of execution in it. Among
	// rules the unit is a rule attempt; inside an @CODE, @POST or @DECL body it
	// is a statement, and there the buttons should behave the way they do in
	// every other debugger -- which is exactly what a user stepping through
	// @POST code expects.
	//
	//                    at a rule            in a statement body
	//   Step Over        next rule tried      next statement, calls run whole
	//   Step Into        next rule matched    next statement, entering a call
	//   Step Out         next pass            until this function returns
	private inStatement(): boolean {
		return this.currentStop?.statement === true;
	}

	protected nextRequest(response: DebugProtocol.NextResponse): void {
		this.sendResponse(response);
		void this.resume(this.inStatement() ? "stepOverStatement" : "stepRule");
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse): void {
		this.sendResponse(response);
		void this.resume(this.inStatement() ? "stepStatement" : "stepMatch");
	}

	protected stepOutRequest(response: DebugProtocol.StepOutResponse): void {
		this.sendResponse(response);
		void this.resume(this.inStatement() ? "stepOutStatement" : "stepPass");
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
		if (stop.statement) {
			// A statement in an @CODE, @POST or @DECL body. The stop is BEFORE
			// the line runs, which is worth saying: the variables read alongside
			// it are the ones that line is about to act on, not its result.
			const where = stop.depth ? ` — ${stop.depth} call${stop.depth === 1 ? "" : "s"} deep` : "";
			frames.push(new StackFrame(1, `statement at line ${stop.line}${where}`,
				source, stop.line));
		} else if (stop.line > 0) {
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
		//
		// A pass with no source file is normal, not an error: the tokenizers
		// (tokenize, dicttokz, chartok ...) are built into the engine and have no
		// .nlp file to open. Left to itself VSCode renders that as "Unknown
		// Source", which reads like something failed -- and the very first pass of
		// most analyzers is a tokenizer, so it is the first thing a user sees.
		// Saying so in the frame name costs nothing and answers the question.
		const passName = this.passLabel(stop);
		const passFrame = new StackFrame(2,
			source ? `Pass ${stop.pass}: ${passName}`
				: `Pass ${stop.pass}: ${passName} (built into the engine — no pass file)`,
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
		// "expensive" tells the client not to fetch until the user expands it.
		// Globals and the parse tree are the two that can be large, and both are
		// a round trip to a stopped engine.
		response.body = {
			scopes: [
				new Scope("Rule", this.variableHandles.create({ kind: "rule" }), false),
				new Scope("Variables", this.variableHandles.create({ kind: "vars" }), false),
				new Scope("Globals G()", this.variableHandles.create({ kind: "globals" }), true),
				new Scope("Current node", this.variableHandles.create({ kind: "node" }), false),
				new Scope("Nodes in play", this.variableHandles.create({ kind: "tree" }), false),
				new Scope("Pass", this.variableHandles.create({ kind: "pass" }), false),
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
					// Deep enough that children expand, and carrying the nodes
					// that FOLLOW: a rule matches a sequence, so those are the
					// ones it is about to be tried against.
					const r = await this.client.node(this.treeDepth, await this.followCount());
					variables = r.node ? this.currentNodeRows(r.node, r.following) : [];
					break;
				}
				case "tree": {
					variables = await this.ruleRegionRows();
					break;
				}
				case "wholeTree": {
					// The document from _ROOT, kept reachable but no longer the
					// default: at a rule stop it is thousands of nodes of which a
					// handful are relevant.
					const tree = await this.client.tree(this.treeDepth);
					variables = tree ? [this.nodeVariable(tree)] : [];
					break;
				}
				case "engineNode":
					variables = this.nodeChildren(ref.node);
					break;
				case "attributes":
					variables = (ref.node.attributes ?? []).map((a) => this.plain(a.name, a.value));
					break;

				// ---- variables ------------------------------------------------
				case "vars":
					// L/S/X grouped under one scope, plus the matched elements.
					// Each row is a separate round trip only when expanded, so an
					// analyzer with no locals costs nothing to display.
					//
					// Once the engine has told us it does not know these commands,
					// say it once here rather than four times inside.
					variables = this.client.supportsVariables
						? [
							this.group("L() locals", { kind: "locals" }),
							this.group("S() suggested", { kind: "suggested" }),
							this.group("X() context", { kind: "context" }),
							this.group("N() matched elements", { kind: "collect" }),
						]
						: [this.plain("(unavailable)", OLD_ENGINE)];
					break;
				case "locals":
					variables = this.varRows(await this.client.locals());
					break;
				case "suggested":
					variables = this.varRows(await this.client.suggested());
					break;
				case "context":
					variables = this.varRows(await this.client.context());
					break;
				case "globals":
					variables = this.varRows(await this.client.globals());
					break;
				case "collect":
					variables = this.collectRows(await this.client.collect());
					break;
			}
		}

		response.body = { variables };
		this.sendResponse(response);
	}

	private plain(name: string, value: string): DebugProtocol.Variable {
		return { name, value, variablesReference: 0 };
	}

	// An expandable row that fetches its contents only when opened.
	private group(name: string, ref: VariableRef): DebugProtocol.Variable {
		return { name, value: "", variablesReference: this.variableHandles.create(ref) };
	}

	// The engine returning nothing and the engine not knowing the question are
	// different answers, and an author staring at an empty pane deserves to be
	// told which one this is.
	private varRows(vars: EngineVar[] | undefined): DebugProtocol.Variable[] {
		if (vars === undefined) return [this.plain("(unavailable)", OLD_ENGINE)];
		if (!vars.length) return [this.plain("(none)", "")];
		return vars.map((v) => this.plain(v.name, v.value));
	}

	// The rule elements matched so far. Labelled by the ordinal N() uses, so the
	// row name is the expression an author would write.
	private collectRows(elements: EngineCollectElement[] | undefined): DebugProtocol.Variable[] {
		if (elements === undefined) return [this.plain("(unavailable)", OLD_ENGINE)];
		if (!elements.length) return [this.plain("(nothing matched yet)", "")];
		return elements.map((e) => {
			const label = `N(${e.ord})`;
			if (!e.single) {
				// The engine's own N(n,"x") refuses a multi-node element, so say
				// that rather than showing one node and implying it is addressable.
				const span = e.spanEnd !== undefined ? ` through ${e.spanEnd}` : "";
				return {
					name: label,
					value: `${e.node.name} … a range of nodes${span} — N() cannot address it`,
					variablesReference: this.variableHandles.create({ kind: "engineNode", node: e.node }),
				};
			}
			return {
				name: label,
				value: this.describeNode(e.node),
				variablesReference: this.variableHandles.create({ kind: "engineNode", node: e.node }),
			};
		});
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
		// Which node the rule is being tried at, and the text under it. The rule
		// and the text it is being matched against belong on the same screen.
		if (stop?.node) {
			out.push(this.plain("matching at", stop.node));
		}
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
		const expandable = (node.children && node.children.length > 0)
			|| (node.childCount ?? 0) > 0
			|| (node.attributes?.length ?? 0) > 0;
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
		// Name the attributes on the row itself so a node carrying values is
		// visible without expanding every node in the tree to find it.
		const attrs = node.attributes && node.attributes.length
			? `  {${node.attributes.map((a) => a.name).join(", ")}}` : "";
		return `${text} (${node.type})${origin}${suffix}${attrs}`;
	}

	private spanText(node: EngineNode): string {
		// The engine sends the text it actually spans. Slicing the input file with
		// start/end is only a fallback for an older engine: those offsets index
		// the engine's buffer, whose line endings are normalised, so on a CRLF
		// file every node past the first line came out shifted -- a "(" rendered
		// as "g", a ")" as "R".
		let raw: string;
		if (typeof node.text === "string") {
			raw = node.text;
		} else if (this.inputText.length && node.ustart >= 0 && node.uend >= node.ustart) {
			raw = this.inputText.slice(node.ustart, node.uend + 1);
		} else {
			return "";
		}
		raw = raw.replace(/\s+/g, " ").trim();
		if (!raw.length) return '""';
		return JSON.stringify(raw.length > 60 ? raw.slice(0, 57) + "..." : raw);
	}

	// How many nodes beyond the current one are worth fetching: enough to cover
	// the rule being tried, with a little slack so the sequence reads in context.
	// Falls back to a handful at a pass boundary, where there is no rule.
	private async followCount(): Promise<number> {
		// One extra round trip to an engine that is already stopped, which costs
		// nothing and avoids caching a value that goes stale at every step.
		const rule = await this.client.rule();
		const n = rule?.elements.length ?? 0;
		return n > 0 ? n + 2 : 6;
	}

	// The nodes a rule is actually about, rather than the whole document.
	//
	// Rooting this at _ROOT meant thousands of nodes of which a handful mattered,
	// and the ones the rule is being tried against were reachable only by walking
	// down from the top. On a MATCH the answer is exact: the collect list is the
	// nodes the rule took. On an attempt the rule has taken nothing yet, so the
	// candidates are the current node and the ones after it.
	private async ruleRegionRows(): Promise<DebugProtocol.Variable[]> {
		const out: DebugProtocol.Variable[] = [];

		const collected = await this.client.collect();
		if (collected && collected.length) {
			out.push(this.plain("(matched)", `${collected.length} element${collected.length === 1 ? "" : "s"}`));
			for (const e of collected) {
				out.push({
					name: `N(${e.ord})`,
					value: e.single ? this.describeNode(e.node) : `${e.node.name} … a range of nodes`,
					variablesReference: this.variableHandles.create({ kind: "engineNode", node: e.node }),
				});
			}
		} else {
			const r = await this.client.node(this.treeDepth, await this.followCount());
			if (r.node) {
				out.push(this.plain("(being tried at)", ""));
				out.push(this.nodeVariable(r.node));
				if (r.following.length) {
					out.push(this.plain("(nodes after it)", ""));
					for (const n of r.following) out.push(this.nodeVariable(n));
				}
			}
		}

		// Never take the whole tree away -- sometimes the context above the rule
		// is exactly what is wanted.
		out.push({
			name: "(whole document tree)",
			value: "",
			variablesReference: this.variableHandles.create({ kind: "wholeTree" }),
		});
		return out;
	}

	// The current node, described before its contents.
	//
	// This scope used to list only the node's children and attributes, so the
	// node itself -- crucially the TEXT it covers -- never appeared anywhere.
	// While a rule is being tried, that text is what the rule is being matched
	// against, which is the single most useful thing on the screen.
	private currentNodeRows(node: EngineNode, following: EngineNode[] = []): DebugProtocol.Variable[] {
		const out: DebugProtocol.Variable[] = [
			this.plain("node", node.name),
			this.plain("text", this.spanText(node) || "(no text)"),
			this.plain("type", node.type),
			this.plain("span", `${node.start}-${node.end}`),
		];
		if (node.passNum > 0) {
			out.push(this.plain("built by", `pass ${node.passNum} line ${node.ruleLine}`));
		}
		const rows = out.concat(this.nodeChildren(node));

		// The nodes that come after this one, in order. A rule matches a
		// sequence, so reading forward from the current node is the natural
		// movement -- and there was no way to do it short of walking the whole
		// tree down from the root.
		if (following.length) {
			rows.push(this.plain("(next nodes)", `${following.length} after this one`));
			following.forEach((n, i) => {
				const row = this.nodeVariable(n);
				row.name = `+${i + 1} ${n.name}`;
				rows.push(row);
			});
		}
		return rows;
	}

	private nodeChildren(node: EngineNode): DebugProtocol.Variable[] {
		const out: DebugProtocol.Variable[] = [];
		// A node's attributes come first: they are what N("x") and X("x") read,
		// and usually the reason to open a node at all.
		if (node.attributes && node.attributes.length) {
			out.push({
				name: "(attributes)",
				value: node.attributes.map((a) => a.name).join(", "),
				variablesReference: this.variableHandles.create({ kind: "attributes", node }),
			});
		}
		if (node.children && node.children.length) {
			for (const c of node.children) out.push(this.nodeVariable(c));
		} else if ((node.childCount ?? 0) > 0) {
			// The engine trimmed the walk at this depth. Rather than pretend the
			// node is a leaf, say what is there and how to get it.
			out.push(this.plain(`(${node.childCount} children)`,
				"expand the Parse tree scope to walk deeper"));
		}
		return out;
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
