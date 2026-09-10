// LSP client: starts the NLP++ language server and wires it into VSCode.
//
// Everything that used to be registered in-process by src/language/providers.ts
// and src/format/formatProvider.ts now lives in the server (src/server/server.ts).
// This file is deliberately thin -- its whole job is transport, watchers, and the
// two things the protocol cannot carry on its own: trusted markdown in hovers and
// telemetry counting.
//
// Engine diagnostics (src/language/engineDiagnostics.ts) stay client-side. They
// are not derived from document text at all: they come from the analyzer's
// err.log and need visualText's analyzer/sequence state, which is extension-host
// knowledge the server has no way to see.

import * as path from "path";
import * as vscode from "vscode";
import {
	LanguageClient, LanguageClientOptions, ServerOptions, TransportKind,
} from "vscode-languageclient/node";
import * as telemetry from "../telemetry/telemetry";

let client: LanguageClient | undefined;

// The server relays telemetry rather than importing the telemetry module, which
// needs VSCode settings and the machine id. Payloads carry an id and numbers
// only -- never document content. Mirrors the counted()/sendEvent() split the
// in-process providers used.
interface TelemetryMessage {
	kind: "count" | "event" | "error";
	id: string;
	reason?: string; // errors only: a short static description, never a raw message
	metrics?: Record<string, number>;
}

export async function startLanguageServer(ctx: vscode.ExtensionContext): Promise<void> {
	const serverModule = ctx.asAbsolutePath(path.join("dist", "server.js"));

	// --nolazy --inspect lets you attach a debugger to the server itself; VSCode
	// only applies debugOptions when the extension host is in development mode,
	// so this costs nothing in a released build.
	const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
	};

	const clientOptions: LanguageClientOptions = {
		// 'nlp' is the language id for both .nlp and .pat files.
		//
		// Deliberately NOT scoped to scheme "file". The providers this replaces
		// registered on the bare language id, so they also served untitled
		// buffers -- a new unsaved pass, and every document the integration suite
		// opens. Adding a scheme here silently drops those: the features simply
		// return nothing, which is indistinguishable from having nothing to say.
		documentSelector: [{ language: "nlp" }],
		synchronize: {
			// Files the index cares about but that may change outside the editor:
			// an analyzer run writes .kbb files, and passes can be added on disk.
			fileEvents: vscode.workspace.createFileSystemWatcher("**/*.{nlp,pat,kbb}"),
		},
		middleware: {
			// A hover returned over LSP arrives as an untrusted MarkdownString, so
			// the command: link to the built-in function's help page would render
			// as inert text. Re-mark it trusted on the way in. Scoped to the one
			// command the server can emit rather than blanket-trusting the string.
			provideHover: async (document, position, token, next) => {
				const hover = await next(document, position, token);
				if (!hover) return hover;
				for (const item of hover.contents) {
					if (item instanceof vscode.MarkdownString) {
						item.isTrusted = { enabledCommands: ["helpView.openFunctionPage"] };
					}
				}
				return hover;
			},
		},
	};

	client = new LanguageClient("nlp", "NLP++ Language Server", serverOptions, clientOptions);

	client.onNotification("nlp/telemetry", (msg: TelemetryMessage) => {
		switch (msg.kind) {
			case "count":
				telemetry.countEvent("language", msg.id);
				break;
			case "event":
				telemetry.sendEvent(msg.id, undefined, msg.metrics);
				break;
			case "error":
				telemetry.sendError(msg.id, msg.reason, msg.metrics);
				break;
		}
	});

	await client.start();
	ctx.subscriptions.push(client);
}

export async function stopLanguageServer(): Promise<void> {
	if (!client) return;
	await client.stop();
	client = undefined;
}
