// Client for the NLP++ engine's rule-level debug server.
//
// PURE MODULE: no 'vscode' import. Speaks the newline-delimited JSON protocol
// that nlp.exe exposes when started with -DEBUG <port> (engine 3.9.0; the
// message catalogue lives at the top of lite/nlpdebug.cpp in nlp-engine).
//
// Shape of the conversation: the engine runs until it hits a pause point, sends
// an unsolicited {"event":"stopped",...}, and then blocks reading commands until
// one of them resumes it. So this client is strictly half-duplex -- requests are
// only answered while the engine is stopped -- and every resume command is the
// last thing sent before waiting for the next event.

import * as cp from "child_process";
import * as net from "net";

// ---- protocol types ---------------------------------------------------------

export type StopReason =
	| "entry" | "step" | "breakpoint" | "matched" | "failed" | "passStart" | "pause";

// The engine's stopped event. Everything but `reason` is best-effort: a stop at
// a pass boundary has no rule or node yet, and eltsMatched only accompanies a
// failure.
export interface EngineStop {
	reason: StopReason;
	pass: number;
	passName: string;   // the pass's file name, as the .tree headers spell it
	line: number;       // line of the rule in that pass file
	ruleOrd: number;    // the rule's position in this node's candidate list
	node?: string;
	nodeStart?: number;
	nodeEnd?: number;
	eltsMatched?: number; // failures only: how far the rule got
}

// One NLP++ variable. The engine renders values with the same call the .tree
// dumps use, so a value reads identically in the debugger and in a dump.
export interface EngineVar {
	name: string;
	value: string;
}

// A rule element that matched, in rule order -- what N(n,"x") indexes.
export interface EngineCollectElement {
	ord: number;
	/**
	 * False when the element matched a RANGE of nodes (a wildcard, say). The
	 * engine's own N(n,"x") lookup refuses those, so the debugger says so
	 * rather than showing one node and implying it is addressable.
	 */
	single: boolean;
	node: EngineNode;
	spanEnd?: number; // ranges only: where the element reached
}

export interface EngineNode {
	name: string;
	type: string;
	start: number;
	end: number;
	ustart: number;
	uend: number;
	passNum: number;
	ruleLine: number;
	fired: boolean;
	built: boolean;
	children?: EngineNode[];
	childCount?: number; // present instead of children when depth ran out
	attributes?: EngineVar[]; // the node's own ("name" value) pairs
}

export interface EngineRuleElement {
	name: string;
	min: number;
	max: number;
}

export interface EngineRule {
	line: number;
	num: number;
	builds?: string;
	elements: EngineRuleElement[];
}

export type ResumeCommand = "continue" | "stepRule" | "stepMatch" | "stepPass";

export interface EngineClientOptions {
	/**
	 * Absolute path to nlp.exe / nlp. Omit to ATTACH to an engine that is
	 * already listening on `port` -- someone having run
	 *   nlp -ANA ... -IN ... -DEBUG 9777
	 * by hand. Everything after connecting is identical either way.
	 */
	enginePath?: string;
	analyzer?: string;    // analyzer directory (launch only)
	input?: string;       // text file to analyze (launch only)
	workDir?: string;     // engine working directory, -WORK (launch only)
	port: number;
	/** Extra args appended verbatim, e.g. ["-DEV"]. Launch only. */
	extraArgs?: string[];
}

// ---- client -----------------------------------------------------------------

export class EngineClient {
	private proc: cp.ChildProcess | undefined;
	private sock: net.Socket | undefined;
	private buf = "";
	private seq = 1;
	private pending = new Map<number, (msg: any) => void>();
	private stopQueue: EngineStop[] = [];
	private stopWaiters: Array<(s: EngineStop) => void> = [];
	private terminated = false;
	private termWaiters: Array<() => void> = [];

	/** Raw stdout/stderr from the engine, for the debug console. */
	public onOutput: ((text: string) => void) | undefined;
	/** Called once when the engine run ends, however it ends. */
	public onTerminated: (() => void) | undefined;

	async start(opts: EngineClientOptions): Promise<void> {
		if (opts.enginePath) {
			const args = [
				"-ANA", String(opts.analyzer ?? ""),
				"-IN", String(opts.input ?? ""),
				"-WORK", String(opts.workDir ?? ""),
				"-DEBUG", String(opts.port),
				...(opts.extraArgs ?? []),
			];
			// Not shell-quoted: execFile-style spawn passes argv through directly,
			// so a path with spaces needs no quoting and adding it would become
			// part of the path.
			this.proc = cp.spawn(opts.enginePath, args, { stdio: ["ignore", "pipe", "pipe"] });
			this.proc.stdout?.on("data", (d) => this.onOutput?.(d.toString()));
			this.proc.stderr?.on("data", (d) => this.onOutput?.(d.toString()));
			this.proc.on("exit", () => this.markTerminated());
			this.proc.on("error", (err) => {
				this.onOutput?.(`failed to start the engine: ${err.message}\n`);
				this.markTerminated();
			});
		}

		this.sock = await this.connect(opts.port);
		this.sock.setEncoding("utf8");
		this.sock.on("data", (chunk: string) => this.consume(chunk));
		this.sock.on("close", () => this.markTerminated());
		this.sock.on("error", () => this.markTerminated());
	}

	// The engine binds its socket before it does anything else, but process start
	// is not instant, so retry briefly rather than racing it.
	private connect(port: number): Promise<net.Socket> {
		return new Promise((resolve, reject) => {
			const attempt = (left: number) => {
				const s = net.connect(port, "127.0.0.1");
				s.once("connect", () => resolve(s));
				s.once("error", () => {
					s.destroy();
					if (left <= 0) {
						reject(new Error(
							`could not reach the engine's debug port ${port}. ` +
							`Does this nlp build support -DEBUG? It needs engine 3.9.0 or later.`));
						return;
					}
					setTimeout(() => attempt(left - 1), 200);
				});
			};
			attempt(50); // ~10s, which covers a cold start with a large KB
		});
	}

	private consume(chunk: string): void {
		this.buf += chunk;
		for (;;) {
			const nl = this.buf.indexOf("\n");
			if (nl < 0) return;
			const line = this.buf.slice(0, nl).trim();
			this.buf = this.buf.slice(nl + 1);
			if (!line.length) continue;
			let msg: any;
			try {
				msg = JSON.parse(line);
			} catch {
				// A malformed line is the engine's problem, not a reason to drop
				// the session; surface it and keep reading.
				this.onOutput?.(`[debug protocol: unparsable line] ${line}\n`);
				continue;
			}
			if (msg.event === "stopped") this.pushStop(msg as EngineStop);
			else if (msg.event === "terminated") this.markTerminated();
			else if (msg.event === "output") this.onOutput?.(String(msg.text ?? ""));
			else if (typeof msg.seq === "number") {
				const resolve = this.pending.get(msg.seq);
				if (resolve) {
					this.pending.delete(msg.seq);
					resolve(msg);
				}
			}
		}
	}

	private pushStop(stop: EngineStop): void {
		const waiter = this.stopWaiters.shift();
		if (waiter) waiter(stop);
		else this.stopQueue.push(stop);
	}

	private markTerminated(): void {
		if (this.terminated) return;
		this.terminated = true;
		// Anything still waiting would hang forever otherwise.
		for (const [, resolve] of this.pending) resolve({ ok: false, error: "engine exited" });
		this.pending.clear();
		for (const w of this.termWaiters) w();
		this.termWaiters = [];
		this.onTerminated?.();
	}

	get isTerminated(): boolean {
		return this.terminated;
	}

	/** Resolves at the engine's next stop, or rejects if the run ends first. */
	nextStop(): Promise<EngineStop> {
		const queued = this.stopQueue.shift();
		if (queued) return Promise.resolve(queued);
		if (this.terminated) return Promise.reject(new Error("the engine run has ended"));
		return new Promise((resolve, reject) => {
			this.stopWaiters.push(resolve);
			this.termWaiters.push(() => reject(new Error("the engine run has ended")));
		});
	}

	private request(command: string, extra?: Record<string, unknown>): Promise<any> {
		if (this.terminated || !this.sock) {
			return Promise.resolve({ ok: false, error: "engine exited" });
		}
		const id = this.seq++;
		const msg = JSON.stringify({ seq: id, command, ...(extra ?? {}) });
		return new Promise((resolve) => {
			this.pending.set(id, resolve);
			this.sock!.write(msg + "\n");
		});
	}

	// ---- commands -----------------------------------------------------------

	/** Resume. The engine answers immediately, then runs to its next stop. */
	resume(command: ResumeCommand): Promise<void> {
		return this.request(command).then(() => undefined);
	}

	/** Breakpoint lines for one pass. An empty list clears that pass. */
	setBreakpoints(pass: number, lines: number[]): Promise<void> {
		return this.request("setBreakpoints", { pass, lines }).then(() => undefined);
	}

	stopOnFailure(value: boolean): Promise<void> {
		return this.request("stopOnFailure", { value }).then(() => undefined);
	}

	async state(): Promise<EngineStop | undefined> {
		const r = await this.request("state");
		return r?.ok ? (r as EngineStop) : undefined;
	}

	async rule(): Promise<EngineRule | undefined> {
		const r = await this.request("rule");
		return r?.ok ? (r.rule ?? undefined) : undefined;
	}

	async node(): Promise<EngineNode | undefined> {
		const r = await this.request("node");
		return r?.ok ? (r.node ?? undefined) : undefined;
	}

	async tree(depth: number): Promise<EngineNode | undefined> {
		const r = await this.request("tree", { depth });
		return r?.ok ? (r.tree ?? undefined) : undefined;
	}

	// ---- variables ----------------------------------------------------------
	//
	// One command per kind rather than one bundle, so expanding a single scope
	// does not pay for the rest -- globals in particular can be numerous.

	/**
	 * True until the engine rejects a variable command as unknown.
	 *
	 * Checked rather than inferred from the engine's version string: the version
	 * is a second thing to keep in step, and getting it wrong shows an empty
	 * Variables pane instead of an explanation. Asking the engine cannot drift.
	 */
	private varsSupported = true;
	get supportsVariables(): boolean { return this.varsSupported; }

	// undefined means "this engine has no such command"; [] means "none set".
	// The difference matters -- one is a stale engine, the other is an analyzer
	// that simply has no locals here, and they should not look alike.
	private async vars(command: string, field: string): Promise<EngineVar[] | undefined> {
		const r = await this.request(command);
		if (r && r.ok === false && typeof r.error === "string"
			 && r.error.indexOf("unknown command") >= 0) {
			this.varsSupported = false;
			return undefined;
		}
		return r?.ok && Array.isArray(r[field]) ? (r[field] as EngineVar[]) : [];
	}

	/** G("x") */
	globals(): Promise<EngineVar[] | undefined> { return this.vars("globals", "globals"); }
	/** L("x") */
	locals(): Promise<EngineVar[] | undefined> { return this.vars("locals", "locals"); }
	/** S("x"), on the node this rule suggests */
	suggested(): Promise<EngineVar[] | undefined> { return this.vars("suggested", "suggested"); }
	/** X("x"), on the pass's select node */
	context(): Promise<EngineVar[] | undefined> { return this.vars("context", "context"); }

	/** The rule elements matched so far, in order: what N(n,"x") indexes. */
	async collect(): Promise<EngineCollectElement[] | undefined> {
		const r = await this.request("collect");
		if (r && r.ok === false && typeof r.error === "string"
			 && r.error.indexOf("unknown command") >= 0) {
			this.varsSupported = false;
			return undefined;
		}
		return r?.ok && Array.isArray(r.collect) ? (r.collect as EngineCollectElement[]) : [];
	}

	/** Let the run finish without the debugger. */
	async detach(): Promise<void> {
		await this.request("detach");
	}

	/** Stop the engine outright. */
	kill(): void {
		try { this.sock?.destroy(); } catch { /* already gone */ }
		try { this.proc?.kill(); } catch { /* already gone */ }
		this.markTerminated();
	}
}
