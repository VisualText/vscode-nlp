// Anonymous, opt-out-respecting usage telemetry for the NLP++ extension.
//
// Backend: a small Cloudflare Worker (see telemetry-worker/) that records events
// into a D1 table. The extension just POSTs a JSON payload, fire-and-forget.
//
// Privacy contract:
//   * Only anonymous counts and metadata are ever sent -- NEVER file contents,
//     analyzer/KB/dict source, file names or paths, or any text being analyzed.
//   * Two independent opt-outs are honored, and nothing is sent if either is off:
//       - VS Code's global telemetry setting (vscode.env.isTelemetryEnabled), and
//       - the extension's own `nlp.telemetry.enable` setting.
//   * With no ENDPOINT configured (the default), this module is a complete no-op:
//     no network calls are made at all.
//   * The only stable identifier sent is vscode.env.machineId, which VS Code
//     already anonymizes; it lets us count unique users without any PII.
//
// To enable: deploy telemetry-worker/ and paste its URL into ENDPOINT below.

import * as vscode from "vscode";

// Cloudflare Worker URL (see telemetry-worker/). Empty -> telemetry disabled.
const ENDPOINT = "https://nlp-telemetry.dehilster.workers.dev";

let extensionVersion = "";

// Both gates must be on. isTelemetryEnabled reflects the user's global VS Code
// telemetry choice; the nlp.telemetry.enable setting is our own switch. Because
// we send to our own endpoint (not a vscode TelemetryLogger), we must check the
// global flag ourselves -- this is where that happens.
function enabled(): boolean {
	return (
		vscode.env.isTelemetryEnabled &&
		vscode.workspace.getConfiguration("nlp").get<boolean>("telemetry.enable", true)
	);
}

export function activate(ctx: vscode.ExtensionContext): void {
	if (!ENDPOINT) return; // no endpoint -> stay a no-op
	extensionVersion = (ctx.extension?.packageJSON?.version as string) ?? "";
	sendEvent("extension.activated");
}

// Record a usage event. `properties` are low-cardinality strings (e.g. a mode
// name); `measurements` are numbers (counts, sizes). Never pass content here.
export function sendEvent(
	name: string,
	properties?: Record<string, string>,
	measurements?: Record<string, number>,
): void {
	post(name, false, properties, measurements);
}

// Record a handled error. Only a short caller-supplied reason and numeric
// context are sent -- never a raw message that might embed a path.
export function sendError(
	name: string,
	reason?: string,
	measurements?: Record<string, number>,
): void {
	post(name, true, reason ? { reason } : undefined, measurements);
}

function post(
	name: string,
	isError: boolean,
	properties?: Record<string, string>,
	measurements?: Record<string, number>,
): void {
	if (!ENDPOINT || !enabled()) return;

	const payload = {
		event: name,
		error: isError || undefined,
		v: extensionVersion,
		vscode: vscode.version,
		platform: process.platform,
		id: vscode.env.machineId, // anonymized by VS Code
		session: vscode.env.sessionId,
		props: properties,
		metrics: measurements,
	};

	// Fire-and-forget: telemetry must never block a command or throw into the UI.
	try {
		void fetch(ENDPOINT, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		}).catch(() => { /* offline / blocked: ignore */ });
	} catch {
		/* fetch unavailable: ignore */
	}
}
