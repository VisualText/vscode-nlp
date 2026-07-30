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
//   * Command ids and enum-ish mode names are static strings from our own source,
//     so they are safe to send. Error *messages* are not -- they routinely embed
//     file paths -- so sendError takes a short caller-chosen reason instead.
//
// To enable: deploy telemetry-worker/ and paste its URL into ENDPOINT below.

import * as vscode from "vscode";

// Cloudflare Worker URL (see telemetry-worker/). Empty -> telemetry disabled.
const ENDPOINT = "https://nlp-telemetry.dehilster.workers.dev";

// How often buffered command counts are flushed as events. Commands like the
// various refreshAll fire constantly; batching keeps this to a handful of
// requests a minute instead of one per keystroke-ish action.
const COMMAND_FLUSH_MS = 60_000;

// Remembers the last version we saw activate, so we can tell a fresh install
// from an upgrade from an ordinary relaunch.
const LAST_VERSION_KEY = "nlp.telemetry.lastVersion";

let extensionVersion = "";
let engineVersion = "";

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

	// install / upgrade / relaunch, plus the version upgraded from. Together with
	// machineId this is what makes adoption and retention curves possible.
	const previous = ctx.globalState.get<string>(LAST_VERSION_KEY, "") ?? "";
	const launch = !previous ? "install" : previous !== extensionVersion ? "upgrade" : "relaunch";
	if (previous !== extensionVersion) void ctx.globalState.update(LAST_VERSION_KEY, extensionVersion);

	const props: Record<string, string> = {
		launch,
		// WSL / SSH / Codespaces vs a plain local window -- changes how engine
		// paths resolve, so it matters when reading path-related failures.
		remote: vscode.env.remoteName ?? "local",
		ui: vscode.env.uiKind === vscode.UIKind.Web ? "web" : "desktop",
		lang: vscode.env.language,
	};
	if (launch === "upgrade") props.from = previous;
	sendEvent("extension.activated", props);

	// Flush any buffered counts on shutdown. Registered here rather than in
	// instrumentCommands so it covers the language-feature counters too, and
	// still applies if the registerCommand patch below could not be installed.
	// Best effort: a fire-and-forget POST may not survive the host tearing down,
	// but the periodic flush means little is ever pending.
	ctx.subscriptions.push(
		new vscode.Disposable(() => {
			if (flushTimer) clearInterval(flushTimer);
			flushTimer = undefined;
			flushCounters();
		}),
	);
}

// The engine version is discovered asynchronously (by running the engine exe),
// so it is not known at activation. Once it is, it rides along on every later
// event, and the first sighting is reported on its own so we learn it even from
// users who do nothing else in the session.
export function setEngineVersion(version: string): void {
	const clean = (version ?? "").trim();
	if (!clean || clean === engineVersion) return;
	const first = !engineVersion;
	engineVersion = clean;
	if (first) sendEvent("engine.detected");
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

// Convenience for timing a step: returns the elapsed ms since it was called.
export function timer(): () => number {
	const start = Date.now();
	return () => Date.now() - start;
}

// --- batched counters ---------------------------------------------------

// Some things happen far too often to report individually: refreshAll commands,
// and language features like hover that fire on mouse movement. These are
// counted in memory and flushed as one event per distinct id per interval, so
// the counts stay exact while the request volume stays tiny.
const counters = new Map<string, number>(); // "event\0id" -> count
let flushTimer: NodeJS.Timeout | undefined;
let patched = false;

// Count one occurrence of `id` under `event`. Both must be static strings from
// our own source (a command id, a provider name) -- never user data.
export function countEvent(event: string, id: string): void {
	// Checked here as well as at flush time, so nothing is even buffered while
	// the user has telemetry off -- toggling it on must not send back history.
	if (!ENDPOINT || !enabled()) return;
	const key = event + "\0" + id;
	counters.set(key, (counters.get(key) ?? 0) + 1);
	ensureFlushTimer();
}

function ensureFlushTimer(): void {
	if (flushTimer) return;
	flushTimer = setInterval(flushCounters, COMMAND_FLUSH_MS);
}

function flushCounters(): void {
	if (!counters.size) return;
	const pending = [...counters.entries()];
	counters.clear();
	for (const [key, n] of pending) {
		const split = key.indexOf("\0");
		sendEvent(key.slice(0, split), { id: key.slice(split + 1) }, { n });
	}
}

// Wrap vscode.commands.registerCommand so every one of the extension's ~224
// contributed commands reports usage, without touching the eleven view files
// that register them. The command id is a literal from package.json, so this
// carries no user data. VS Code hands each extension its own `vscode` API
// object, so the patch cannot leak into other extensions.
//
// Must be called before the views register their commands.
export function instrumentCommands(): void {
	if (!ENDPOINT || patched) return;

	const original = vscode.commands.registerCommand;
	const wrap = function (
		command: string,
		callback: (...args: any[]) => any,
		thisArg?: any,
	): vscode.Disposable {
		const instrumented = function (this: any, ...args: any[]): any {
			countEvent("command", command);
			try {
				const result = callback.apply(thisArg ?? this, args);
				// Async handlers fail later; report the rejection but never swallow it.
				if (result && typeof result.then === "function") {
					return result.then(undefined, (err: any) => {
						sendError("command.error", failureReason(command, err));
						throw err;
					});
				}
				return result;
			} catch (err) {
				sendError("command.error", failureReason(command, err));
				throw err;
			}
		};
		// thisArg is already bound above, so it is not forwarded again.
		return original.call(vscode.commands, command, instrumented);
	};

	try {
		(vscode.commands as any).registerCommand = wrap;
	} catch {
		return; // API object frozen in this VS Code build: skip instrumentation
	}
	// A non-writable property assigned outside strict mode fails silently rather
	// than throwing, so confirm the patch actually took before relying on it.
	if (vscode.commands.registerCommand !== (wrap as any)) return;
	patched = true;
}

// Error *class* name only. Messages are deliberately excluded: they routinely
// contain absolute paths and analyzer names.
function failureReason(command: string, err: any): string {
	const kind = err?.constructor?.name ?? (err?.name || "Error");
	return command + ":" + kind;
}

// --- transport ----------------------------------------------------------

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
		arch: process.arch, // x64 vs arm64: decides which engine ABI is usable
		engine: engineVersion || undefined,
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
