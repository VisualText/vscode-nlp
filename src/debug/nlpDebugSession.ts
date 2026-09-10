// NLP++ replay debugger: a Debug Adapter Protocol session over a completed run.
//
// No 'vscode' import -- this runs as its own process (see debugAdapter.ts), so
// any DAP-speaking editor can drive it.
//
// WHAT THIS IS. The engine already dumps a full parse-tree snapshot per pass into
// <text>_log/ana###.tree, each node tagged with the pass and rule line that built
// it. This adapter replays those snapshots as if they were execution states. You
// get stepping over passes, breakpoints in pass files, a tree-shaped variables
// view, and -- because every state is already on disk -- stepping BACKWARD as
// well as forward, which a live debugger could not offer without recording.
//
// WHAT THIS IS NOT. Granularity is the pass, not the individual rule: between two
// snapshots the engine ran a whole pass, so you cannot stop midway through one,
// inspect a partial match, or change a value and continue. Rule-level stepping
// needs a debug stub inside the C++ engine that can pause and answer queries.
// The pieces here (breakpoint mapping, the tree variables view, the stack model)
// are the parts that would be reused if that ever lands; only the "advance to the
// next state" step would change.

import {
	LoggingDebugSession, InitializedEvent, TerminatedEvent, StoppedEvent,
	OutputEvent, Thread, StackFrame, Scope, Source, Handles, Breakpoint,
} from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import * as path from "path";
import * as fs from "fs";
import {
	Trace, TracePass, loadTrace, findLatestLogDir, passesForSource, firedRuleLines,
} from "../trace/traceModel";
import { TraceNode } from "../trace/treeParse";

// The debug adapter has one conceptual thread: the analyzer running its passes.
const THREAD_ID = 1;

export interface NlpLaunchArguments extends DebugProtocol.LaunchRequestArguments {
	// The analyzer directory (the one holding spec/ and input/). Required.
	analyzer: string;
	// A specific <text>_log directory to replay. Defaults to the most recently
	// written one under the analyzer's input/ tree.
	logDir?: string;
	// Stop on the first pass instead of running to the first breakpoint.
	stopOnEntry?: boolean;
}

// What a variables handle can point at. Scopes are fixed; nodes are the tree.
type VariableRef =
	| { kind: "pass" }
	| { kind: "tree" }
	| { kind: "node"; node: TraceNode }
	| { kind: "attributes"; node: TraceNode };

export class NlpDebugSession extends LoggingDebugSession {
	private trace: Trace | undefined;
	// Index into trace.passes of the pass we are currently stopped at.
	private cursor = 0;
	private variableHandles = new Handles<VariableRef>();
	// Breakpoint lines the user set, keyed by resolved lowercase source path.
	private breakpoints = new Map<string, number[]>();
	private breakpointSeq = 1;

	public constructor() {
		super("nlp-debug.log");
		// The engine reports lines 1-based and columns 1-based; matching that
		// avoids an off-by-one between the tree dumps and the editor.
		this.setDebuggerLinesStartAt1(true);
		this.setDebuggerColumnsStartAt1(true);
	}

	protected initializeRequest(
		response: DebugProtocol.InitializeResponse,
		_args: DebugProtocol.InitializeRequestArguments,
	): void {
		response.body = response.body ?? {};
		response.body.supportsConfigurationDoneRequest = true;
		// The whole run is on disk, so backward stepping is free -- this is the
		// capability that makes a replay debugger worth having over a log dump.
		response.body.supportsStepBack = true;
		response.body.supportsRestartRequest = true;
		response.body.supportsEvaluateForHovers = true;
		response.body.supportsTerminateRequest = true;
		// Rule-level granularity does not exist here; do not advertise features
		// that would imply it.
		response.body.supportsStepInTargetsRequest = false;
		response.body.supportsConditionalBreakpoints = false;

		this.sendResponse(response);
		this.sendEvent(new InitializedEvent());
	}

	protected async launchRequest(
		response: DebugProtocol.LaunchResponse,
		args: NlpLaunchArguments,
	): Promise<void> {
		const analyzer = args.analyzer;
		if (!analyzer || !fs.existsSync(analyzer)) {
			this.sendErrorResponse(response, 1001, `Analyzer directory not found: ${analyzer}`);
			return;
		}

		const logDir = args.logDir ?? findLatestLogDir(analyzer);
		if (!logDir || !fs.existsSync(logDir)) {
			this.sendErrorResponse(response, 1002,
				"No analyzer output to replay. Run the analyzer once (with tree output enabled) and try again.");
			return;
		}

		this.trace = loadTrace(logDir);
		if (!this.trace.passes.length) {
			this.sendErrorResponse(response, 1003,
				`No pass dumps (ana###.tree) found in ${logDir}. Was the run made with tree output enabled?`);
			return;
		}

		const runName = this.trace.inputFile ? path.basename(this.trace.inputFile) : path.basename(logDir);
		this.emit_(`Replaying ${this.trace.passes.length} passes over "${runName}".\n`);
		this.emit_(`Trace: ${logDir}\n`);
		this.emit_("Pass granularity: each step advances one whole pass. Step Back is available.\n\n");

		this.cursor = 0;
		this.sendResponse(response);

		// Stop on entry, or run forward to the first breakpoint like a real launch.
		if (args.stopOnEntry) {
			this.stop_("entry");
		} else {
			this.runForward();
		}
	}

	// ---- Breakpoints --------------------------------------------------------

	// Move a requested breakpoint line onto a line where a rule actually fired.
	// A rule spans from its head (`_name <-`) down to the `@@` terminator and the
	// engine reports the head line, so a click anywhere inside a rule body should
	// snap UP to that head. Only if nothing fired at or above the click do we look
	// downward, which covers a breakpoint set above the first rule in the file.
	private static snapToFiredLine(line: number, fired: number[]): number | undefined {
		let above: number | undefined;
		let below: number | undefined;
		for (const f of fired) {
			if (f <= line) { if (above === undefined || f > above) above = f; }
			else if (below === undefined || f < below) below = f;
		}
		return above ?? below;
	}

	protected setBreakPointsRequest(
		response: DebugProtocol.SetBreakpointsResponse,
		args: DebugProtocol.SetBreakpointsArguments,
	): void {
		const sourcePath = args.source.path ?? "";
		const key = path.resolve(sourcePath).toLowerCase();
		const requested = args.breakpoints?.map((b) => b.line) ?? [];

		const passes = this.trace ? passesForSource(this.trace, sourcePath) : [];
		// A breakpoint is only meaningful if the pass it sits in actually ran in
		// the trace being replayed.
		const fired = new Set<number>();
		for (const pass of passes) for (const line of firedRuleLines(pass)) fired.add(line);
		const firedList = [...fired];

		const resolved: number[] = [];
		const breakpoints = requested.map((line) => {
			const snapped = NlpDebugSession.snapToFiredLine(line, firedList);
			const effective = snapped ?? line;
			resolved.push(effective);

			const bp = new Breakpoint(passes.length > 0, effective) as DebugProtocol.Breakpoint;
			bp.id = this.breakpointSeq++;
			if (!passes.length) {
				bp.message = "This pass did not run in the trace being replayed.";
			} else if (snapped === undefined) {
				// Worth saying plainly: "no rule in this pass fired" is one of the
				// most common things an NLP++ author actually needs to find out.
				bp.message = "No rule fired anywhere in this pass during this run; will stop when the pass is reached.";
			} else if (snapped !== line) {
				bp.message = `Moved to line ${snapped}, the rule that fired here.`;
			}
			return bp;
		});

		this.breakpoints.set(key, resolved);
		response.body = { breakpoints };
		this.sendResponse(response);
	}

	// Does any breakpoint select `pass`? Returns the line to report, preferring a
	// line where a rule actually fired.
	private breakpointLineFor(pass: TracePass): number | undefined {
		if (!pass.sourceFile) return undefined;
		const key = path.resolve(pass.sourceFile).toLowerCase();
		const lines = this.breakpoints.get(key);
		if (!lines || !lines.length) return undefined;
		const fired = firedRuleLines(pass);
		for (const line of lines) if (fired.has(line)) return line;
		return lines[0];
	}

	// ---- Execution ----------------------------------------------------------

	private get passes(): TracePass[] {
		return this.trace?.passes ?? [];
	}

	private current(): TracePass | undefined {
		return this.passes[this.cursor];
	}

	// Advance until a breakpoint selects a pass, or the run ends.
	private runForward(): void {
		for (let i = this.cursor; i < this.passes.length; i++) {
			if (this.breakpointLineFor(this.passes[i]) !== undefined) {
				this.cursor = i;
				this.stop_("breakpoint");
				return;
			}
		}
		this.finish();
	}

	private runBackward(): void {
		for (let i = this.cursor - 1; i >= 0; i--) {
			if (this.breakpointLineFor(this.passes[i]) !== undefined) {
				this.cursor = i;
				this.stop_("breakpoint");
				return;
			}
		}
		// Nothing behind us: settle on the first pass rather than terminating,
		// so the session stays inspectable.
		this.cursor = 0;
		this.stop_("step");
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse): void {
		this.sendResponse(response);
		this.cursor++;
		this.runForward();
	}

	protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse): void {
		this.sendResponse(response);
		this.runBackward();
	}

	protected nextRequest(response: DebugProtocol.NextResponse): void {
		this.sendResponse(response);
		if (this.cursor + 1 >= this.passes.length) {
			this.finish();
			return;
		}
		this.cursor++;
		this.stop_("step");
	}

	// There is no finer granularity to step into, so Step In behaves as Step Over
	// rather than silently doing nothing.
	protected stepInRequest(response: DebugProtocol.StepInResponse): void {
		this.nextRequest(response as DebugProtocol.NextResponse);
	}

	// Step Out runs the rest of the analyzer.
	protected stepOutRequest(response: DebugProtocol.StepOutResponse): void {
		this.sendResponse(response);
		this.cursor++;
		this.runForward();
	}

	protected stepBackRequest(response: DebugProtocol.StepBackResponse): void {
		this.sendResponse(response);
		this.cursor = Math.max(0, this.cursor - 1);
		this.stop_("step");
	}

	protected restartRequest(response: DebugProtocol.RestartResponse): void {
		this.cursor = 0;
		this.sendResponse(response);
		this.stop_("entry");
	}

	protected terminateRequest(response: DebugProtocol.TerminateResponse): void {
		this.sendResponse(response);
		this.sendEvent(new TerminatedEvent());
	}

	private stop_(reason: string): void {
		// Handles point into the previous pass's tree; they must not survive a move.
		this.variableHandles.reset();
		const pass = this.current();
		if (pass) {
			this.emit_(
				`Pass ${pass.passNum} (${pass.passName}) — ${pass.nodeCount} nodes, ` +
				`${pass.firedCount} fired, ${pass.builtCount} built\n`);
		}
		this.sendEvent(new StoppedEvent(reason, THREAD_ID));
	}

	private finish(): void {
		const last = this.passes[this.passes.length - 1];
		if (last) this.emit_(`\nRun complete: ${this.passes.length} passes, final tree has ${last.nodeCount} nodes.\n`);
		this.sendEvent(new TerminatedEvent());
	}

	private emit_(text: string): void {
		this.sendEvent(new OutputEvent(text, "stdout"));
	}

	// ---- Stack --------------------------------------------------------------

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
		response.body = { threads: [new Thread(THREAD_ID, "NLP++ analysis")] };
		this.sendResponse(response);
	}

	protected stackTraceRequest(
		response: DebugProtocol.StackTraceResponse,
		_args: DebugProtocol.StackTraceArguments,
	): void {
		const pass = this.current();
		if (!pass) {
			response.body = { stackFrames: [], totalFrames: 0 };
			this.sendResponse(response);
			return;
		}

		// One frame: the pass. A deeper stack would be a fiction -- passes run in
		// sequence, they do not call each other.
		const line = this.breakpointLineFor(pass) ?? this.firstFiredLine(pass) ?? 1;
		const source = pass.sourceFile
			? new Source(path.basename(pass.sourceFile), pass.sourceFile)
			: undefined;
		const frame = new StackFrame(
			this.cursor + 1,
			`Pass ${pass.passNum}: ${pass.passName}`,
			source,
			line,
		);
		// A pass with no source file (the tokenizer, say) has nowhere to point.
		if (!source) frame.presentationHint = "subtle";

		response.body = { stackFrames: [frame], totalFrames: 1 };
		this.sendResponse(response);
	}

	private firstFiredLine(pass: TracePass): number | undefined {
		const lines = [...firedRuleLines(pass)].sort((a, b) => a - b);
		return lines.length ? lines[0] : undefined;
	}

	// ---- Variables ----------------------------------------------------------

	protected scopesRequest(response: DebugProtocol.ScopesResponse): void {
		response.body = {
			scopes: [
				new Scope("Pass", this.variableHandles.create({ kind: "pass" }), false),
				new Scope("Parse tree", this.variableHandles.create({ kind: "tree" }), true),
			],
		};
		this.sendResponse(response);
	}

	protected variablesRequest(
		response: DebugProtocol.VariablesResponse,
		args: DebugProtocol.VariablesArguments,
	): void {
		const ref = this.variableHandles.get(args.variablesReference);
		const pass = this.current();
		let variables: DebugProtocol.Variable[] = [];

		if (ref && pass) {
			switch (ref.kind) {
				case "pass":
					variables = this.passVariables(pass);
					break;
				case "tree":
					variables = pass.root ? [this.nodeVariable(pass.root)] : [];
					break;
				case "node":
					variables = this.nodeChildren(ref.node);
					break;
				case "attributes":
					variables = ref.node.attributes.map((a) => ({
						name: a.name, value: a.value, variablesReference: 0,
					}));
					break;
			}
		}

		response.body = { variables };
		this.sendResponse(response);
	}

	private passVariables(pass: TracePass): DebugProtocol.Variable[] {
		const plain = (name: string, value: string): DebugProtocol.Variable =>
			({ name, value, variablesReference: 0 });
		const fired = [...firedRuleLines(pass)].sort((a, b) => a - b);
		return [
			plain("pass number", String(pass.passNum)),
			plain("name", pass.passName),
			plain("source", pass.sourceFile ? path.basename(pass.sourceFile) : "(built-in)"),
			plain("nodes", String(pass.nodeCount)),
			plain("nodes matched", String(pass.firedCount)),
			plain("nodes built", String(pass.builtCount)),
			plain("rule lines fired", fired.length ? fired.join(", ") : "(none)"),
			plain("position", `${this.cursor + 1} of ${this.passes.length}`),
		];
	}

	// One tree node, rendered so the label carries the useful part: the covered
	// text and where it came from.
	private nodeVariable(node: TraceNode): DebugProtocol.Variable {
		const hasChildren = node.children.length > 0 || node.attributes.length > 0;
		return {
			name: node.name,
			value: this.describeNode(node),
			variablesReference: hasChildren ? this.variableHandles.create({ kind: "node", node }) : 0,
			// Lets the client show a child count without expanding first.
			indexedVariables: 0,
			namedVariables: node.children.length + (node.attributes.length ? 1 : 0),
		};
	}

	private describeNode(node: TraceNode): string {
		const text = this.spanText(node);
		const flags: string[] = [];
		if (node.built) flags.push("built");
		else if (node.fired) flags.push("fired");
		if (node.unsealed) flags.push("unsealed");
		// Provenance is the payload: which pass and rule line produced this node.
		const origin = node.passNum > 0 ? ` — pass ${node.passNum} line ${node.ruleLine}` : "";
		const suffix = flags.length ? ` [${flags.join(", ")}]` : "";
		return `${text} (${node.type})${origin}${suffix}`;
	}

	// The input text a node covers, trimmed to something readable in a tree view.
	private spanText(node: TraceNode): string {
		const input = this.trace?.inputText ?? "";
		if (!input.length || node.ustart < 0 || node.uend < node.ustart) return "";
		const raw = input.slice(node.ustart, node.uend + 1).replace(/\s+/g, " ").trim();
		if (!raw.length) return '""';
		const clipped = raw.length > 60 ? raw.slice(0, 57) + "..." : raw;
		return JSON.stringify(clipped);
	}

	private nodeChildren(node: TraceNode): DebugProtocol.Variable[] {
		const out: DebugProtocol.Variable[] = [];
		if (node.attributes.length) {
			out.push({
				name: "(attributes)",
				value: node.attributes.map((a) => a.name).join(", "),
				variablesReference: this.variableHandles.create({ kind: "attributes", node }),
			});
		}
		for (const child of node.children) out.push(this.nodeVariable(child));
		return out;
	}

	// ---- Evaluate (hover / watch) -------------------------------------------

	protected evaluateRequest(
		response: DebugProtocol.EvaluateResponse,
		args: DebugProtocol.EvaluateArguments,
	): void {
		const pass = this.current();
		const name = args.expression.trim();
		if (!pass || !pass.root || !name.length) {
			this.sendErrorResponse(response, 2001, "Nothing to evaluate at this point in the replay.");
			return;
		}

		// Hovering a rule or concept name in a pass file answers the question that
		// actually comes up: did this produce anything, and where?
		const matches: TraceNode[] = [];
		const visit = (n: TraceNode): void => {
			if (n.name === name) matches.push(n);
			for (const c of n.children) visit(c);
		};
		visit(pass.root);

		if (!matches.length) {
			response.body = { result: `no "${name}" nodes in the tree at pass ${pass.passNum}`, variablesReference: 0 };
			this.sendResponse(response);
			return;
		}

		const container: TraceNode = {
			...matches[0],
			name,
			children: matches,
			attributes: [],
		};
		response.body = {
			result: `${matches.length} × ${name}`,
			variablesReference: this.variableHandles.create({ kind: "node", node: container }),
			namedVariables: matches.length,
		};
		this.sendResponse(response);
	}
}
