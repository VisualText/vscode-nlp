// Test harness for the live debug session -- the DAP side of the debugger.
//
// Runs with plain Node (no Electron/VSCode, and no engine), compiled via
// tsconfig.debug.json and run by `npm run test:debug` alongside debugTest.ts.
//
// WHY THIS EXISTS. debugTest.ts covers EngineClient, the wire. Everything above
// it -- what a breakpoint on line 36 turns into, what the panes are handed at a
// stop, which engine command a step button sends -- had no test at all, and
// three bugs in a row landed there:
//
//   * a breakpoint on an element line was accepted and never fired,
//   * starting the debugger opened on the built-in tokenizer, every pane empty,
//   * starting with a breakpoint set stopped somewhere else first.
//
// None of them threw. Each one looked like a debugger that quietly did not
// work, and each was found by a person driving it by hand.
//
// HOW. The session is driven in process over a pair of streams -- a DAP session
// speaks over whatever streams it is started on -- against a fake engine on a
// loopback port. The session's ATTACH path is used, because launch spawns a
// process and there is no engine here to spawn; everything after connecting is
// the same code either way. The one thing attach cannot reach is the decision
// about where a session should first stop, and that is why it lives in
// entryAction as a plain function, tested directly at the bottom.

import * as fs from "fs";
import * as net from "net";
import * as os from "os";
import * as path from "path";
import { PassThrough } from "stream";
import { NlpLiveDebugSession, entryAction } from "./nlpLiveDebugSession";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string): void {
	if (cond) {
		passed++;
	} else {
		failed++;
		console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
	}
}
function eq<T>(name: string, actual: T, expected: T): void {
	check(name, actual === expected,
		`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function deep(name: string, actual: unknown, expected: unknown): void {
	check(name, JSON.stringify(actual) === JSON.stringify(expected),
		`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ---- the analyzer the session reads --------------------------------------
//
// Written out rather than pointed at a checked-in one, because the assertions
// are about LINE NUMBERS -- which line a breakpoint lands on is the whole point
// of half of them -- and a fixture someone reformats later would take the
// meaning of the test with it.

const PASS_FILE_LINES = [
	"# money.nlp",                          //  1
	"",                                     //  2
	"@NODES _ROOT",                         //  3
	"",                                     //  4
	"@POST",                                //  5
	'\tS("value") = N("value",1);',         //  6
	"\tsingle();",                          //  7
	"@RULES",                               //  8
	"_money <-",                            //  9
	"\t_det [s]\t### (1)",                  // 10
	"\ttotal [s]\t### (2)",                 // 11
	"\t@@",                                 // 12
	"",                                     // 13
	"@RULES",                               // 14
	"_other <-",                            // 15
	"\t_xNUM [s]\t### (1)",                 // 16
	"\t@@",                                 // 17
];
const RULE_HEAD = 9;      // `_money <-`
const RULE_ELEMENT = 11;  // `total [s]`, inside that rule
const POST_STATEMENT = 6; // a statement in the @POST above it

function makeAnalyzer(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlpsess-"));
	fs.mkdirSync(path.join(dir, "spec"));
	fs.writeFileSync(path.join(dir, "spec", "analyzer.seq"),
		"tokenize\tnil\t# built into the engine\nnlp\tmoney\t# pass 2\n", "utf8");
	fs.writeFileSync(path.join(dir, "spec", "money.nlp"),
		PASS_FILE_LINES.join("\n") + "\n", "utf8");
	return dir;
}
const PASS_OF_MONEY = 2;

// ---- a fake engine --------------------------------------------------------

interface Fake {
	port: number;
	/** Every whole line the session has sent, as parsed objects. */
	sent: Array<Record<string, any>>;
	/** Commands seen, in order -- what a step button turned into. */
	commands(): string[];
	/** Push an unsolicited event (a stop, say). */
	emit(obj: Record<string, unknown>): void;
	close(): Promise<void>;
}

/**
 * @param replies what to answer per command, beyond {ok:true}. A command that
 *        is absent still gets {ok:true} -- the session asks for scopes it may
 *        not need, and an unanswered request would hang the test rather than
 *        fail it.
 * @param unknown commands to refuse the way an older engine does.
 * @param delays hold a reply back, to open a window a real client races into.
 */
function fakeEngine(
	replies: Record<string, Record<string, unknown>> = {},
	unknown: string[] = [],
	delays: Record<string, number> = {},
): Promise<Fake> {
	return new Promise((resolve) => {
		const sent: Array<Record<string, any>> = [];
		let sock: net.Socket | undefined;
		let buf = "";
		const srv = net.createServer((s) => {
			sock = s;
			s.setEncoding("utf8");
			s.on("data", (d: string) => {
				buf += d;
				for (;;) {
					const nl = buf.indexOf("\n");
					if (nl < 0) break;
					const line = buf.slice(0, nl);
					buf = buf.slice(nl + 1);
					let msg: Record<string, any>;
					try {
						msg = JSON.parse(line);
					} catch {
						continue;
					}
					sent.push(msg);
					const cmd = String(msg.command ?? "");
					const reply = unknown.indexOf(cmd) >= 0
						? { seq: msg.seq, ok: false, error: `unknown command: ${cmd}` }
						: { seq: msg.seq, ok: true, ...(replies[cmd] ?? {}) };
					const send = (): void => {
						try { s.write(JSON.stringify(reply) + "\n"); } catch { /* gone */ }
					};
					const hold = delays[cmd] ?? 0;
					if (hold > 0) setTimeout(send, hold);
					else send();
				}
			});
			s.on("error", () => { /* the test may close abruptly */ });
		});
		srv.listen(0, "127.0.0.1", () => {
			const addr = srv.address();
			resolve({
				port: typeof addr === "object" && addr ? addr.port : 0,
				sent,
				commands: () => sent.map((m) => String(m.command ?? "")),
				emit: (obj) => { try { sock?.write(JSON.stringify(obj) + "\n"); } catch { /* gone */ } },
				close: () => new Promise<void>((r) => {
					try { sock?.destroy(); } catch { /* already gone */ }
					srv.close(() => r());
				}),
			});
		});
	});
}

// ---- a DAP client speaking to the session in process ----------------------

class Dap {
	private seq = 1;
	private buf = Buffer.alloc(0);
	private pending = new Map<number, (r: any) => void>();
	readonly events: any[] = [];
	private toSession = new PassThrough();
	private fromSession = new PassThrough();

	constructor(session: NlpLiveDebugSession) {
		this.fromSession.on("data", (chunk: Buffer) => this.consume(chunk));
		session.start(this.toSession, this.fromSession);
	}

	private consume(chunk: Buffer): void {
		this.buf = Buffer.concat([this.buf, chunk]);
		for (;;) {
			const head = this.buf.indexOf("\r\n\r\n");
			if (head < 0) return;
			const m = /Content-Length: (\d+)/i.exec(this.buf.subarray(0, head).toString());
			if (!m) return;
			const len = parseInt(m[1], 10);
			if (this.buf.length < head + 4 + len) return;
			const msg = JSON.parse(this.buf.subarray(head + 4, head + 4 + len).toString("utf8"));
			this.buf = this.buf.subarray(head + 4 + len);
			if (msg.type === "response") {
				const r = this.pending.get(msg.request_seq);
				if (r) { this.pending.delete(msg.request_seq); r(msg); }
			} else if (msg.type === "event") {
				this.events.push(msg);
			}
		}
	}

	send(command: string, args?: unknown): Promise<any> {
		const msg = { seq: this.seq++, type: "request", command, arguments: args ?? {} };
		return new Promise((resolve) => {
			this.pending.set(msg.seq, resolve);
			const body = JSON.stringify(msg);
			this.toSession.write(
				`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
		});
	}

	/** Wait for an event, removing it. Rejects rather than hanging forever. */
	wait(name: string, ms = 8000): Promise<any> {
		const t0 = Date.now();
		return new Promise((resolve, reject) => {
			const tick = (): void => {
				const i = this.events.findIndex((e) => e.event === name);
				if (i >= 0) return resolve(this.events.splice(i, 1)[0]);
				if (Date.now() - t0 > ms) return reject(new Error(`timed out waiting for ${name}`));
				setTimeout(tick, 5);
			};
			tick();
		});
	}
}

const settle = (ms = 60): Promise<unknown> => new Promise((r) => setTimeout(r, ms));

/** Attach a session to a fake engine and get past the first stop. */
async function attached(fake: Fake, analyzer: string): Promise<Dap> {
	const dap = new Dap(new NlpLiveDebugSession());
	await dap.send("initialize", { adapterID: "nlpxx", linesStartAt1: true, columnsStartAt1: true });
	// The engine is sitting at a stop the moment a client attaches.
	setTimeout(() => fake.emit({
		event: "stopped", reason: "matched", pass: PASS_OF_MONEY, passName: "money.nlp",
		line: RULE_HEAD, ruleOrd: 1, node: "_det", nodeStart: 10, nodeEnd: 13,
	}), 30);
	await dap.send("attach", { mode: "live", analyzer, port: fake.port });
	await dap.wait("stopped");
	return dap;
}

/** Move the session to a stop of our choosing, the way a step would. */
async function stopAt(dap: Dap, fake: Fake, stop: Record<string, unknown>): Promise<void> {
	const resumed = dap.send("next", { threadId: 1 });
	await settle(40);
	fake.emit({ event: "stopped", pass: PASS_OF_MONEY, passName: "money.nlp", ruleOrd: 1, ...stop });
	await resumed;
	await dap.wait("stopped");
}

async function main(): Promise<void> {
	const analyzer = makeAnalyzer();

	// ---- a breakpoint set on an element line lands on the rule --------------
	// The engine knows a rule by its head line and reports no other, but the eye
	// lands on the element that names what is being looked for. Set on line 11
	// and sent through as 11, the breakpoint is accepted and then never fires --
	// the failure that started all of this, and it is silent.
	{
		const fake = await fakeEngine();
		const dap = await attached(fake, analyzer);
		const r = await dap.send("setBreakpoints", {
			source: { path: path.join(analyzer, "spec", "money.nlp") },
			breakpoints: [{ line: RULE_ELEMENT }],
		});
		const bp = r.body.breakpoints[0];
		eq("a breakpoint inside a rule moves to the rule's head", bp.line, RULE_HEAD);
		check("it is verified", bp.verified === true);
		check("and says that it moved", /line 9/.test(String(bp.message)),
			`message was ${JSON.stringify(bp.message)}`);

		await settle();
		const sb = fake.sent.filter((m) => m.command === "setBreakpoints").pop();
		eq("the engine is told the pass", sb?.pass, PASS_OF_MONEY);
		deep("the engine is sent the head line, not the line clicked", sb?.lines, [RULE_HEAD]);

		await dap.send("disconnect", { terminateDebuggee: true });
		await fake.close();
	}

	// ---- several breakpoints in one rule are one stop -----------------------
	{
		const fake = await fakeEngine();
		const dap = await attached(fake, analyzer);
		await dap.send("setBreakpoints", {
			source: { path: path.join(analyzer, "spec", "money.nlp") },
			breakpoints: [{ line: RULE_HEAD }, { line: 10 }, { line: RULE_ELEMENT }],
		});
		await settle();
		const sb = fake.sent.filter((m) => m.command === "setBreakpoints").pop();
		deep("three breakpoints in one rule are sent as one line", sb?.lines, [RULE_HEAD]);
		await dap.send("disconnect", { terminateDebuggee: true });
		await fake.close();
	}

	// ---- a breakpoint in an @POST goes through unmoved -----------------------
	// Outside every rule the line clicked IS the unit that runs, so snapping it
	// anywhere would be wrong.
	{
		const fake = await fakeEngine({ capabilities: { capabilities: ["statements"] } });
		const dap = await attached(fake, analyzer);
		const r = await dap.send("setBreakpoints", {
			source: { path: path.join(analyzer, "spec", "money.nlp") },
			breakpoints: [{ line: POST_STATEMENT }],
		});
		eq("a statement breakpoint keeps its line", r.body.breakpoints[0].line, POST_STATEMENT);
		check("and is verified", r.body.breakpoints[0].verified === true);
		await settle();
		const sb = fake.sent.filter((m) => m.command === "setBreakpoints").pop();
		deep("the engine gets the statement's own line", sb?.lines, [POST_STATEMENT]);
		await dap.send("disconnect", { terminateDebuggee: true });
		await fake.close();
	}

	// ---- an engine too old for statements withdraws it out loud -------------
	// Breakpoints arrive before the engine is connected, so one outside a rule
	// is accepted optimistically. If the engine turns out not to stop on
	// statements it has to be taken back VISIBLY: a breakpoint that is accepted
	// and then never fires is worse than one that was refused.
	{
		// The race is the point: a client sends its breakpoints while the adapter
		// is still connecting, so the answer has to be given before the engine
		// has said what it can do. Holding the capabilities reply back is what
		// makes that window reliable rather than a matter of scheduling luck.
		const fake = await fakeEngine({}, ["capabilities"], { capabilities: 250 });
		const dap = new Dap(new NlpLiveDebugSession());
		await dap.send("initialize", { adapterID: "nlpxx", linesStartAt1: true, columnsStartAt1: true });
		const attaching = dap.send("attach", { mode: "live", analyzer, port: fake.port });
		await settle(60);   // the sequence is loaded; capabilities is in flight

		const r = await dap.send("setBreakpoints", {
			source: { path: path.join(analyzer, "spec", "money.nlp") },
			breakpoints: [{ line: POST_STATEMENT }],
		});
		check("accepted while the engine is still coming up",
			r.body.breakpoints[0].verified === true,
			JSON.stringify(r.body.breakpoints[0]));

		fake.emit({
			event: "stopped", reason: "matched", pass: PASS_OF_MONEY, passName: "money.nlp",
			line: RULE_HEAD, ruleOrd: 1,
		});
		await attaching;
		await settle(120);

		const changed = dap.events.filter((e) => e.event === "breakpoint");
		eq("the old engine makes it withdraw one breakpoint", changed.length, 1);
		check("withdrawn, not left looking live", changed[0]?.body?.breakpoint?.verified === false);
		check("with the version in the reason",
			/3\.12\.0/.test(String(changed[0]?.body?.breakpoint?.message)),
			`message was ${JSON.stringify(changed[0]?.body?.breakpoint?.message)}`);

		await dap.send("disconnect", { terminateDebuggee: true });
		await fake.close();
	}

	// ---- the frame says which kind of stop this is --------------------------
	// DAP's stop reason cannot carry "this rule failed after two elements" or
	// "this is a statement two calls deep", and those are the whole story.
	{
		const fake = await fakeEngine();
		const dap = await attached(fake, analyzer);

		let st = await dap.send("stackTrace", { threadId: 1 });
		check("a match says so", /matched/.test(st.body.stackFrames[0].name),
			st.body.stackFrames[0].name);
		eq("the pass frame is underneath", st.body.stackFrames.length, 2);
		check("the pass file is opened at the rule",
			st.body.stackFrames[0].source?.name === "money.nlp"
			&& st.body.stackFrames[0].line === RULE_HEAD);

		await stopAt(dap, fake, { reason: "failed", line: RULE_HEAD, eltsMatched: 2 });
		st = await dap.send("stackTrace", { threadId: 1 });
		check("a failure says how far it got",
			/failed after 2 elements/.test(st.body.stackFrames[0].name),
			st.body.stackFrames[0].name);

		await stopAt(dap, fake, {
			reason: "statement", line: POST_STATEMENT, statement: true, depth: 0,
		});
		st = await dap.send("stackTrace", { threadId: 1 });
		eq("a statement stop reads as a statement",
			st.body.stackFrames[0].name, `statement at line ${POST_STATEMENT}`);

		await stopAt(dap, fake, {
			reason: "statement", line: POST_STATEMENT, statement: true, depth: 2,
		});
		st = await dap.send("stackTrace", { threadId: 1 });
		check("inside a call it says how deep",
			/2 calls deep/.test(st.body.stackFrames[0].name), st.body.stackFrames[0].name);

		await dap.send("disconnect", { terminateDebuggee: true });
		await fake.close();
	}

	// ---- the step buttons follow where the engine is stopped ----------------
	// An analyzer has two kinds of execution in it and one set of buttons. At a
	// rule the unit is a rule; in an @CODE, @POST or @DECL body it is a
	// statement, and sending the rule command there would step past the whole
	// region.
	{
		const fake = await fakeEngine();
		const dap = await attached(fake, analyzer);

		const pressed = async (button: string): Promise<string> => {
			const before = fake.sent.length;
			void dap.send(button, { threadId: 1 });
			await settle(50);
			const cmd = fake.sent.slice(before).map((m) => String(m.command))
				.filter((c) => /^step|^continue/.test(c))[0] ?? "(none)";
			fake.emit({
				event: "stopped", reason: "matched", pass: PASS_OF_MONEY,
				passName: "money.nlp", line: RULE_HEAD, ruleOrd: 1,
			});
			await dap.wait("stopped");
			return cmd;
		};

		eq("at a rule, Step Over tries the next rule", await pressed("next"), "stepRule");
		eq("at a rule, Step Into goes to the next match", await pressed("stepIn"), "stepMatch");
		eq("at a rule, Step Out goes to the next pass", await pressed("stepOut"), "stepPass");

		// Land on a statement, and the same three buttons change meaning.
		await stopAt(dap, fake, {
			reason: "statement", line: POST_STATEMENT, statement: true, depth: 1,
		});

		const pressedFromStatement = async (button: string): Promise<string> => {
			const before = fake.sent.length;
			void dap.send(button, { threadId: 1 });
			await settle(50);
			const cmd = fake.sent.slice(before).map((m) => String(m.command))
				.filter((c) => /^step|^continue/.test(c))[0] ?? "(none)";
			fake.emit({
				event: "stopped", reason: "statement", pass: PASS_OF_MONEY,
				passName: "money.nlp", line: POST_STATEMENT, ruleOrd: 1,
				statement: true, depth: 1,
			});
			await dap.wait("stopped");
			return cmd;
		};
		eq("in a body, Step Over runs a call whole",
			await pressedFromStatement("next"), "stepOverStatement");
		eq("in a body, Step Into enters a call",
			await pressedFromStatement("stepIn"), "stepStatement");
		eq("in a body, Step Out returns from the function",
			await pressedFromStatement("stepOut"), "stepOutStatement");

		await dap.send("disconnect", { terminateDebuggee: true });
		await fake.close();
	}

	// ---- the panes are handed what the engine said --------------------------
	{
		const fake = await fakeEngine({
			rule: { rule: { line: RULE_HEAD, num: 1, builds: "_money", elements: [{ name: "_det" }, { name: "total" }] } },
			globals: { globals: [{ name: "runs", value: "11" }] },
			locals: { locals: [{ name: "by", value: "10" }] },
			suggested: { suggested: [] },
			context: { context: [] },
			collect: { collect: [] },
			node: { node: { name: "_det", text: "the", type: "alpha" }, following: [] },
			tree: { tree: { name: "_ROOT", children: [] } },
		});
		const dap = await attached(fake, analyzer);
		const st = await dap.send("stackTrace", { threadId: 1 });
		const scopes = await dap.send("scopes", { frameId: st.body.stackFrames[0].id });
		const names = scopes.body.scopes.map((s: any) => s.name);
		deep("every pane is offered", names,
			["Rule", "Variables", "Globals G()", "Current node", "Nodes in play", "Pass"]);

		const byName = (n: string): number =>
			scopes.body.scopes.find((s: any) => s.name === n).variablesReference;

		const rule = await dap.send("variables", { variablesReference: byName("Rule") });
		const built = rule.body.variables.find((v: any) => v.name === "builds");
		eq("the rule pane shows what the rule builds", built?.value, "_money");

		const globals = await dap.send("variables", { variablesReference: byName("Globals G()") });
		const runs = globals.body.variables.find((v: any) => v.name === "runs");
		eq("a global reaches the pane with its value", runs?.value, "11");

		const node = await dap.send("variables", { variablesReference: byName("Current node") });
		const text = node.body.variables.find((v: any) => v.name === "text");
		check("the node pane shows the text the engine sent",
			String(text?.value).indexOf("the") >= 0, `text row was ${JSON.stringify(text)}`);

		await dap.send("disconnect", { terminateDebuggee: true });
		await fake.close();
	}

	// ---- a file that is not a pass is refused, with the reason --------------
	{
		const fake = await fakeEngine();
		const dap = await attached(fake, analyzer);
		const r = await dap.send("setBreakpoints", {
			source: { path: path.join(analyzer, "spec", "notapass.nlp") },
			breakpoints: [{ line: 3 }],
		});
		check("a breakpoint in a file outside the sequence is refused",
			r.body.breakpoints[0].verified === false);
		check("and says why", /sequence/.test(String(r.body.breakpoints[0].message)),
			`message was ${JSON.stringify(r.body.breakpoints[0].message)}`);
		await dap.send("disconnect", { terminateDebuggee: true });
		await fake.close();
	}

	// ---- where a session first stops ----------------------------------------
	// The one decision attach cannot reach, and the one that has been wrong
	// twice. Both times nothing failed -- the debugger just opened somewhere
	// unhelpful -- which is exactly the kind of bug a test has to carry.
	eq("no stopOnEntry: run", entryAction(false, false, "passStart"), "continue");
	eq("no stopOnEntry, breakpoints set: still run",
		entryAction(false, true, "passStart"), "continue");
	eq("breakpoints set: run to them rather than stopping short",
		entryAction(true, true, "passStart"), "continue");
	eq("breakpoints set, already somewhere real: still run to them",
		entryAction(true, true, "matched"), "continue");
	eq("no breakpoints, at a pass boundary: step on to something worth showing",
		entryAction(true, false, "passStart"), "stepRule");
	eq("no breakpoints, already at a rule: show it",
		entryAction(true, false, "matched"), "announce");
	eq("no breakpoints, at a statement: show it",
		entryAction(true, false, "statement"), "announce");
	eq("an unknown stop is shown rather than skipped",
		entryAction(true, false, undefined), "announce");

	fs.rmSync(analyzer, { recursive: true, force: true });
	console.log(`\ndebug session tests: ${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
}

main().catch((err) => {
	console.error("harness threw:", err instanceof Error ? err.stack : String(err));
	process.exit(1);
});
