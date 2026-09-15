// Language server tests: the real handlers, over a real LSP connection, with the
// workspace's files from both sources.
//
// Runs with plain Node, compiled via tsconfig.language.json and run by
// `npm run test:server`. Exits non-zero on any failed assertion.
//
// WHAT IT GUARDS. serverCore.ts is shared by dist/server.js and
// dist/browserServer.js, and the only thing that differs is where the files come
// from. So the same questions are asked of both sources: does go-to-definition
// cross from one pass to another, do references and workspace symbols see the
// other file, do files outside the workspace or under output/ stay out -- and,
// for the page-fed source, do files added, removed and replaced by
// nlp/workspaceFiles reach the index.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PassThrough } from "stream";
import { URI } from "vscode-uri";
import {
	createConnection, createProtocolConnection, ProposedFeatures,
	StreamMessageReader, StreamMessageWriter,
} from "vscode-languageserver/node";
import { startServer } from "./serverCore";
import { NodeFiles } from "./nodeFiles";
import { MemoryFiles, acceptWorkspaceFiles, WORKSPACE_FILES } from "./memoryFiles";
import { WorkspaceFiles } from "./workspaceFiles";

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
	check(name, JSON.stringify(actual) === JSON.stringify(expected),
		`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// One pass declares a function and a rule; another calls the function, a
// built-in, and a misspelling of the function.
const FUNCS = `@DECL
helper(L("x")) {
	return L("x");
}
@@DECL

@RULES
_thing <- thing @@
`;
const USE = `@CODE
L("y") = helper(1);
L("z") = strval(L("c"),"said");
L("w") = helpr(2);
@@CODE
`;

// The position of the first `word` in `text`, as LSP counts it.
function at(text: string, word: string): { line: number; character: number } {
	const offset = text.indexOf(word);
	const before = text.slice(0, offset).split("\n");
	return { line: before.length - 1, character: before[before.length - 1].length };
}

async function until<T>(get: () => Promise<T> | T, ok: (v: T) => boolean, ms = 3000): Promise<T> {
	const start = Date.now();
	let value = await get();
	while (!ok(value) && Date.now() - start < ms) {
		await new Promise((r) => setTimeout(r, 25));
		value = await get();
	}
	return value;
}

interface Session {
	request<R>(method: string, params: unknown): Promise<R>;
	notify(method: string, params: unknown): void;
	diagnostics: Map<string, Array<{ code?: string; message: string }>>;
	close(): void;
}

async function open(files: WorkspaceFiles, rootUri: string, memory?: MemoryFiles): Promise<Session> {
	const toServer = new PassThrough();
	const toClient = new PassThrough();
	const serverConnection = createConnection(
		ProposedFeatures.all, new StreamMessageReader(toServer), new StreamMessageWriter(toClient));
	const server = startServer(serverConnection, files);
	if (memory) acceptWorkspaceFiles(serverConnection, memory, server);
	server.listen();

	const client = createProtocolConnection(new StreamMessageReader(toClient), new StreamMessageWriter(toServer));
	const diagnostics = new Map<string, Array<{ code?: string; message: string }>>();
	client.onNotification("textDocument/publishDiagnostics", (p: { uri: string; diagnostics: [] }) => {
		diagnostics.set(p.uri, p.diagnostics);
	});
	client.onNotification("nlp/telemetry", () => { /* the extension records these */ });
	client.listen();

	await client.sendRequest("initialize", {
		processId: null, rootUri: null, capabilities: {},
		workspaceFolders: [{ uri: rootUri, name: "analyzer" }],
	});
	await client.sendNotification("initialized", {});
	return {
		request: <R>(method: string, params: unknown) => client.sendRequest(method, params) as Promise<R>,
		notify: (method, params) => { void client.sendNotification(method, params); },
		diagnostics,
		close: () => {
			client.dispose();
			serverConnection.dispose();
			toServer.end();
			toClient.end();
		},
	};
}

type Loc = { uri: string };
type Sym = { name: string };

// The questions both file sources must answer the same way.
async function crossFile(label: string, s: Session, funcsUri: string, useUri: string): Promise<void> {
	s.notify("textDocument/didOpen", { textDocument: { uri: useUri, languageId: "nlp", version: 1, text: USE } });

	const def = await s.request<Loc[]>("textDocument/definition",
		{ textDocument: { uri: useUri }, position: at(USE, "helper") });
	eq(`${label}: definition crosses to the pass that declares it`, def.map((l) => l.uri), [funcsUri]);

	const refs = await s.request<Loc[]>("textDocument/references",
		{ textDocument: { uri: useUri }, position: at(USE, "helper"), context: { includeDeclaration: true } });
	const refUris = [...new Set(refs.map((l) => l.uri))].sort();
	eq(`${label}: references see both passes`, refUris, [funcsUri, useUri].sort());

	const hover = await s.request<{ contents: { value: string } } | null>("textDocument/hover",
		{ textDocument: { uri: useUri }, position: at(USE, "strval") });
	check(`${label}: hover names a built-in`, !!hover && hover.contents.value.includes("built-in"),
		JSON.stringify(hover));

	const syms = await s.request<Sym[]>("workspace/symbol", { query: "help" });
	check(`${label}: workspace symbols find the declaration`, syms.some((x) => x.name === "helper"),
		JSON.stringify(syms));
	eq(`${label}: a file under output/ stays out`,
		(await s.request<Sym[]>("workspace/symbol", { query: "ghost" })).length, 0);

	const tokens = await s.request<{ data: number[] }>("textDocument/semanticTokens/full",
		{ textDocument: { uri: useUri } });
	check(`${label}: semantic tokens are produced`, tokens.data.length > 0);

	const diags = await until(() => s.diagnostics.get(useUri) ?? [],
		(d) => d.some((x) => x.code === "nlp.unknown-function"));
	check(`${label}: a misspelled call is flagged with the user function as the fix`,
		diags.some((x) => x.code === "nlp.unknown-function" && x.message.includes("'helper'")),
		JSON.stringify(diags));
}

async function memorySource(): Promise<void> {
	const root = "memory:/analyzer";
	const funcsUri = `${root}/spec/funcs.nlp`;
	const useUri = `${root}/spec/use.nlp`;
	const memory = new MemoryFiles();
	memory.apply({
		files: [
			{ uri: funcsUri, text: FUNCS },
			{ uri: `${root}/output/copy.nlp`, text: "@DECL\nghost() {\n}\n@@DECL\n" },
			{ uri: "memory:/elsewhere/spec/other.nlp", text: "@DECL\nstranger() {\n}\n@@DECL\n" },
		],
	});
	const s = await open(memory, root, memory);
	try {
		await crossFile("memory", s, funcsUri, useUri);
		eq("memory: a file outside the workspace folder stays out",
			(await s.request<Sym[]>("workspace/symbol", { query: "stranger" })).length, 0);

		const laterUri = `${root}/spec/later.nlp`;
		s.notify(WORKSPACE_FILES, { files: [{ uri: laterUri, text: "@DECL\nlater() {\n}\n@@DECL\n" }] });
		const added = await until(() => s.request<Sym[]>("workspace/symbol", { query: "later" }), (v) => v.length > 0);
		eq("memory: a file sent later is indexed", added.map((x) => x.name), ["later"]);

		s.notify(WORKSPACE_FILES, { removed: [laterUri] });
		const gone = await until(() => s.request<Sym[]>("workspace/symbol", { query: "later" }), (v) => v.length === 0);
		eq("memory: a removed file leaves the index", gone.length, 0);

		s.notify(WORKSPACE_FILES, { files: [{ uri: `${root}/output/late.nlp`, text: "@DECL\nlateghost() {\n}\n@@DECL\n" }] });
		await new Promise((r) => setTimeout(r, 100));
		eq("memory: a file sent under output/ is not indexed",
			(await s.request<Sym[]>("workspace/symbol", { query: "lateghost" })).length, 0);

		s.notify(WORKSPACE_FILES, { replace: true, files: [{ uri: `${root}/spec/fresh.nlp`, text: "@DECL\nfresh() {\n}\n@@DECL\n" }] });
		const fresh = await until(() => s.request<Sym[]>("workspace/symbol", { query: "fresh" }), (v) => v.length > 0);
		eq("memory: replace indexes the new set", fresh.map((x) => x.name), ["fresh"]);
		eq("memory: ...and forgets the old one",
			(await s.request<Sym[]>("workspace/symbol", { query: "helper" })).length, 0);
	} finally {
		s.close();
	}
}

async function diskSource(): Promise<void> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-server-test-"));
	try {
		fs.mkdirSync(path.join(dir, "spec"));
		fs.mkdirSync(path.join(dir, "output"));
		fs.writeFileSync(path.join(dir, "spec", "funcs.nlp"), FUNCS);
		fs.writeFileSync(path.join(dir, "output", "copy.nlp"), "@DECL\nghost() {\n}\n@@DECL\n");
		const s = await open(new NodeFiles(), URI.file(dir).toString());
		try {
			await crossFile("disk", s, URI.file(path.join(dir, "spec", "funcs.nlp")).toString(),
				URI.file(path.join(dir, "spec", "use.nlp")).toString());
		} finally {
			s.close();
		}
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	// MemoryFiles on its own: the rules a page-fed workspace must share with the disk walk.
	{
		const m = new MemoryFiles();
		const r = m.apply({
			files: [
				{ uri: "memory:/a/spec/x.nlp", text: "" },
				{ uri: "memory:/a/spec/y.pat", text: "" },
				{ uri: "memory:/a/kb/user/z.kbb", text: "" },
				{ uri: "memory:/a/spec/readme.md", text: "" },
				{ uri: "memory:/a/input/text.txt_log/p.kbb", text: "" },
				{ uri: "memory:/ab/spec/x.nlp", text: "" },
			],
		});
		eq("files: apply reports what changed", r.changed.length, 6);
		eq("files: lists .nlp, .pat and .kbb under the root, and nothing under *_log/ or a sibling root",
			(await m.list(["memory:/a"])).sort(),
			["memory:/a/kb/user/z.kbb", "memory:/a/spec/x.nlp", "memory:/a/spec/y.pat"]);
		eq("files: a trailing slash on the root is the same root",
			(await m.list(["memory:/a/"])).length, 3);
		const again = m.apply({ replace: true, files: [{ uri: "memory:/a/spec/x.nlp", text: "kept" }] });
		eq("files: replace reports the files it dropped, not the one it kept",
			again.removed.sort(), [
				"memory:/a/input/text.txt_log/p.kbb", "memory:/a/kb/user/z.kbb", "memory:/a/spec/readme.md",
				"memory:/a/spec/y.pat", "memory:/ab/spec/x.nlp",
			]);
		eq("files: reads what was sent", await m.read("memory:/a/spec/x.nlp"), "kept");
	}

	await memorySource();
	await diskSource();

	console.log(`\nlanguage server: ${passed} passed, ${failed} failed`);
	process.exit(failed ? 1 : 0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
