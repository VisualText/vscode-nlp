// Test harness for the engine debug client's protocol handling.
//
// Runs with plain Node (no Electron/VSCode, and no engine) over EngineClient,
// mirroring src/trace/traceTest.ts. Compiled via tsconfig.debug.json and run by
// `npm run test:debug`.
//
// What is worth pinning here is the wire handling, because it is the part that
// fails silently: a message split across two TCP reads, two messages arriving in
// one read, a reply correlated to the wrong request, or a waiter left hanging
// when the engine exits. None of that shows up in a happy-path manual run, and
// all of it would look like "the debugger froze".
//
// The tests use the client's attach path -- no enginePath, so nothing is
// spawned -- against a fake server on a loopback port speaking the engine's
// protocol. That is the same transport the launch path uses once connected, so
// everything below exercises the real framing and correlation code.

import * as net from "net";
import { EngineClient } from "./engineClient";

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
	check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

interface Fake {
	port: number;
	/** Bytes written to whichever client is connected. */
	write(text: string): void;
	/** Every whole line the client has sent. */
	received: string[];
	close(): Promise<void>;
}

function fakeEngine(): Promise<Fake> {
	return new Promise((resolve) => {
		const received: string[] = [];
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
					received.push(buf.slice(0, nl));
					buf = buf.slice(nl + 1);
				}
			});
			s.on("error", () => { /* the test may close abruptly */ });
		});
		srv.listen(0, "127.0.0.1", () => {
			const addr = srv.address();
			const port = typeof addr === "object" && addr ? addr.port : 0;
			resolve({
				port,
				write: (text: string) => { try { sock?.write(text); } catch { /* closed */ } },
				received,
				close: () => new Promise<void>((r) => {
					try { sock?.destroy(); } catch { /* already gone */ }
					srv.close(() => r());
				}),
			});
		});
	});
}

async function startClient(fake: Fake): Promise<EngineClient> {
	const client = new EngineClient();
	await client.start({ port: fake.port }); // attach: no process is spawned
	return client;
}

// Give the socket a moment to deliver; the client has no "flushed" signal.
const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const STOP = (extra = "") =>
	`{"event":"stopped","reason":"breakpoint","pass":15,"passName":"spec/moneyAttributes.nlp",` +
	`"line":17,"ruleOrd":3,"node":"_money","nodeStart":163,"nodeEnd":166${extra}}`;

async function main(): Promise<void> {
	// ---- framing: two messages in one chunk, one message split across chunks --
	{
		const fake = await fakeEngine();
		const client = await startClient(fake);

		// Both events arrive in a single TCP write.
		fake.write(STOP() + "\n" + STOP(',"eltsMatched":2') + "\n");
		const first = await client.nextStop();
		const second = await client.nextStop();
		eq("framing: first of two in one chunk", first.line, 17);
		eq("framing: second of two in one chunk", second.eltsMatched, 2);

		// One event split mid-token across two writes.
		const whole = STOP() + "\n";
		fake.write(whole.slice(0, 20));
		await settle(30);
		fake.write(whole.slice(20));
		const third = await client.nextStop();
		eq("framing: message split across reads", third.pass, 15);
		eq("framing: split message keeps its name", third.passName, "spec/moneyAttributes.nlp");

		// A stop that arrives before anyone asks for it must be queued, not lost.
		fake.write(STOP() + "\n");
		await settle();
		const queued = await client.nextStop();
		eq("framing: stop queued before nextStop", queued.reason, "breakpoint");

		client.kill();
		await fake.close();
	}

	// ---- request / response correlation --------------------------------------
	{
		const fake = await fakeEngine();
		const client = await startClient(fake);

		// Answer out of order: the second request replies first. A client that
		// matched replies positionally rather than by seq would cross the wires.
		const ruleP = client.rule();
		const nodeP = client.node();
		await settle();
		eq("correlation: two requests were sent", fake.received.length, 2);
		const ruleSeq = JSON.parse(fake.received[0]).seq;
		const nodeSeq = JSON.parse(fake.received[1]).seq;
		eq("correlation: first request is rule", JSON.parse(fake.received[0]).command, "rule");
		eq("correlation: second request is node", JSON.parse(fake.received[1]).command, "node");

		fake.write(`{"seq":${nodeSeq},"ok":true,"node":{"name":"_money","type":"node","start":163,` +
			`"end":166,"ustart":163,"uend":166,"passNum":14,"ruleLine":79,"fired":true,"built":true}}\n`);
		fake.write(`{"seq":${ruleSeq},"ok":true,"rule":{"line":17,"num":1,"builds":"_money",` +
			`"elements":[{"name":"_money","min":1,"max":1},{"name":"in","min":1,"max":1}]}}\n`);

		const rule = await ruleP;
		const node = await nodeP;
		eq("correlation: rule reply reached the rule request", rule?.line, 17);
		eq("correlation: rule builds", rule?.builds, "_money");
		eq("correlation: rule element count", rule?.elements.length, 2);
		eq("correlation: node reply reached the node request", node?.name, "_money");
		eq("correlation: node provenance", node?.ruleLine, 79);

		client.kill();
		await fake.close();
	}

	// ---- command shapes ------------------------------------------------------
	{
		const fake = await fakeEngine();
		const client = await startClient(fake);

		void client.setBreakpoints(15, [17, 23]);
		void client.stopOnFailure(true);
		void client.tree(2);
		void client.resume("stepMatch");
		await settle();

		const sent = fake.received.map((l) => JSON.parse(l));
		eq("commands: setBreakpoints command", sent[0].command, "setBreakpoints");
		eq("commands: setBreakpoints pass", sent[0].pass, 15);
		eq("commands: setBreakpoints lines", JSON.stringify(sent[0].lines), "[17,23]");
		eq("commands: stopOnFailure value", sent[1].value, true);
		eq("commands: tree depth", sent[2].depth, 2);
		eq("commands: resume is sent verbatim", sent[3].command, "stepMatch");
		check("commands: every message carries a distinct seq",
			new Set(sent.map((m) => m.seq)).size === sent.length);

		client.kill();
		await fake.close();
	}

	// ---- a malformed line must not kill the session --------------------------
	{
		const fake = await fakeEngine();
		const client = await startClient(fake);
		const noise: string[] = [];
		client.onOutput = (t) => noise.push(t);

		fake.write("this is not json\n");
		fake.write(STOP() + "\n");
		const stop = await client.nextStop();
		eq("malformed: the next good message still arrives", stop.line, 17);
		check("malformed: the bad line was reported", noise.some((n) => n.includes("unparsable")));
		check("malformed: session is still live", !client.isTerminated);

		client.kill();
		await fake.close();
	}

	// ---- variables -----------------------------------------------------------
	// Every NLP++ variable kind arrives as the same {name,value} shape, because
	// the engine stores them all as one Dlist<Ipair>. What is worth pinning is
	// that each command reads its OWN field out of the reply -- a copy-paste slip
	// there returns an empty list rather than an error, and the pane just looks
	// like the analyzer has no variables.
	{
		const fake = await fakeEngine();
		const client = await startClient(fake);

		const gP = client.globals();
		const lP = client.locals();
		const sP = client.suggested();
		const xP = client.context();
		const cP = client.collect();
		await settle();

		const sent = fake.received.map((l) => JSON.parse(l));
		eq("vars: five commands were sent", sent.length, 5);
		eq("vars: command names", sent.map((m) => m.command).join(","),
			"globals,locals,suggested,context,collect");

		const reply = (i: number, body: string) =>
			fake.write(`{"seq":${sent[i].seq},"ok":true,${body}}
`);
		reply(0, '"globals":[{"name":"corporate","value":"concept:\\"corporate\\""}]');
		reply(1, '"locals":[{"name":"n","value":"3"}]');
		reply(2, '"suggested":[{"name":"value","value":"130"}]');
		reply(3, '"context":[]');
		reply(4, '"collect":[' +
			'{"ord":1,"single":true,"node":{"name":"No","type":"alpha","start":24,"end":25,' +
			'"ustart":24,"uend":25,"passNum":0,"ruleLine":0,"fired":false,"built":false,"attributes":[]}},' +
			'{"ord":2,"single":false,"spanEnd":40,"node":{"name":"_x","type":"node","start":27,"end":30,' +
			'"ustart":27,"uend":30,"passNum":4,"ruleLine":9,"fired":true,"built":true,' +
			'"attributes":[{"name":"number","value":"1"}]}}]');

		const globals = (await gP) ?? [];
		eq("vars: globals count", globals.length, 1);
		eq("vars: global name", globals[0].name, "corporate");
		eq("vars: global value keeps its quotes", globals[0].value, 'concept:"corporate"');
		eq("vars: locals", ((await lP) ?? [])[0]?.value, "3");
		eq("vars: suggested", ((await sP) ?? [])[0]?.name, "value");
		eq("vars: context may be empty", ((await xP) ?? []).length, 0);

		const coll = (await cP) ?? [];
		eq("collect: element count", coll.length, 2);
		eq("collect: first ordinal", coll[0].ord, 1);
		check("collect: a single-node element is marked single", coll[0].single === true);
		eq("collect: node name", coll[0].node.name, "No");
		// A range element is what N(n,"x") cannot address; the flag is how the
		// client knows to say so instead of showing one node.
		check("collect: a range element is marked not single", coll[1].single === false);
		eq("collect: range reports where it reached", coll[1].spanEnd, 40);
		eq("collect: node attributes come through", coll[1].node.attributes?.[0]?.name, "number");

		client.kill();
		await fake.close();
	}

	// A reply that is missing its field, or malformed, yields an empty list
	// rather than throwing -- a stopped engine is still usable.
	{
		const fake = await fakeEngine();
		const client = await startClient(fake);
		const p = client.globals();
		await settle();
		const seqNo = JSON.parse(fake.received[0]).seq;
		fake.write(`{"seq":${seqNo},"ok":true}
`); // no "globals" field
		eq("vars: a reply with no payload is an empty list", ((await p) ?? []).length, 0);
		client.kill();
		await fake.close();
	}

	// ---- an engine too old to know the variable commands ----------------------
	// The commands arrived in engine 3.10.0. An older one answers "unknown
	// command", and the difference between that and "no variables are set" is
	// the difference between a stale install and a real property of the
	// analyzer -- so undefined and [] must not be conflated.
	{
		const fake = await fakeEngine();
		const client = await startClient(fake);
		check("old engine: variables assumed supported until told otherwise",
			client.supportsVariables);

		const p = client.globals();
		await settle();
		const seqNo = JSON.parse(fake.received[0]).seq;
		fake.write(`{"seq":${seqNo},"ok":false,"error":"unknown command: globals"}
`);
		const result = await p;
		check("old engine: an unknown command reads as undefined, not empty",
			result === undefined, `got ${JSON.stringify(result)}`);
		check("old engine: the client remembers", !client.supportsVariables);

		// A genuine failure that is NOT "unknown command" must not be mistaken
		// for an old engine.
		const c = client.collect();
		await settle();
		const seq2 = JSON.parse(fake.received[1]).seq;
		fake.write(`{"seq":${seq2},"ok":false,"error":"no rule in progress"}
`);
		const coll = await c;
		check("old engine: an ordinary failure is still an empty list",
			Array.isArray(coll) && coll.length === 0, `got ${JSON.stringify(coll)}`);

		client.kill();
		await fake.close();
	}

	// ---- termination ---------------------------------------------------------
	{
		const fake = await fakeEngine();
		const client = await startClient(fake);
		let notified = false;
		client.onTerminated = () => { notified = true; };

		// A waiter outstanding when the run ends must be rejected, not left to
		// hang -- that is the difference between "the run finished" and "the
		// debugger froze".
		const waiting = client.nextStop();
		fake.write('{"event":"terminated"}\n');

		let rejected = false;
		try {
			await waiting;
		} catch {
			rejected = true;
		}
		check("terminated: an outstanding nextStop rejects", rejected);
		check("terminated: onTerminated fired", notified);
		check("terminated: isTerminated is set", client.isTerminated);

		// Requests after the end resolve with a failure rather than hanging.
		const after = await client.rule();
		eq("terminated: later requests resolve as undefined", after, undefined);

		client.kill();
		await fake.close();
	}

	// ---- the engine process exiting ends the session too ---------------------
	{
		const fake = await fakeEngine();
		const client = await startClient(fake);
		const waiting = client.nextStop();
		client.kill(); // stands in for the engine dying

		let rejected = false;
		try {
			await waiting;
		} catch {
			rejected = true;
		}
		check("exit: killing the engine rejects a pending wait", rejected);
		check("exit: isTerminated is set", client.isTerminated);
		await fake.close();
	}

	console.log(`\ndebug client tests: ${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
}

main().catch((err) => {
	console.error("harness threw:", err instanceof Error ? err.stack : String(err));
	process.exit(1);
});
