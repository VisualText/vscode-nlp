// Cloudflare Worker that receives anonymous usage pings from the NLP++ VS Code
// extension and records them in a D1 table. Deploy with wrangler (see README.md),
// then paste the deployed URL into src/telemetry/telemetry.ts (ENDPOINT).
//
// The extension only ever sends anonymous counts/metadata (event name, extension
// + VS Code version, platform, an anonymized machineId, and small numeric
// measurements). No file contents, names, or paths are sent.

function clamp(v, n) {
	return v == null ? null : String(v).slice(0, n);
}

export default {
	async fetch(request, env, ctx) {
		// GET = health check (handy to curl after deploy).
		if (request.method === "GET") {
			return new Response("nlp telemetry ok\n", { status: 200 });
		}
		if (request.method !== "POST") {
			return new Response("method not allowed", { status: 405 });
		}

		let data;
		try {
			data = await request.json();
		} catch {
			return new Response("bad json", { status: 400 });
		}
		if (!data || typeof data.event !== "string") {
			return new Response("missing event", { status: 400 });
		}

		const stmt = env.DB.prepare(
			`INSERT INTO events
			   (ts, event, is_error, version, vscode, platform, machine_id, props, metrics)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).bind(
			Date.now(),
			clamp(data.event, 64),
			data.error ? 1 : 0,
			clamp(data.v, 32),
			clamp(data.vscode, 32),
			clamp(data.platform, 32),
			clamp(data.id, 64),
			data.props ? JSON.stringify(data.props).slice(0, 512) : null,
			data.metrics ? JSON.stringify(data.metrics).slice(0, 512) : null,
		);

		// Respond immediately; let the write finish in the background.
		ctx.waitUntil(stmt.run().catch(() => { /* swallow write errors */ }));
		return new Response(null, { status: 204 });
	},
};
