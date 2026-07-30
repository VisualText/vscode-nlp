# NLP++ telemetry worker

A tiny Cloudflare Worker that records anonymous usage pings from the NLP++ VS Code
extension into a D1 (SQLite) database. No Azure, no credit card — runs on
Cloudflare's free tier.

It receives only anonymous counts/metadata: event name, extension + VS Code
version, platform/arch, engine version, an anonymized `machineId`, a per-window
`sessionId`, and small numeric measurements. Never any file contents, names, or
paths — and never an error message, only a fixed reason string chosen in our own
source.

### Upgrading an existing database

`arch`, `engine`, and `session_id` were added after the first deploy. SQLite has
no `ADD COLUMN IF NOT EXISTS`, so run these once against an already-created D1
(re-running `schema.sql` will not add them, because the table already exists):

```bash
for col in "arch TEXT" "engine TEXT" "session_id TEXT"; do
  npx wrangler d1 execute nlp-telemetry --remote --command "ALTER TABLE events ADD COLUMN $col"
done
npx wrangler d1 execute nlp-telemetry --remote \
  --command "CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)"
```

## One-time deploy

`wrangler` is installed locally here as a devDependency, so run it with `npx`
(no global install needed). From this `telemetry-worker/` directory:

```bash
npm install            # first time only: installs wrangler locally
npx wrangler login

# 1. Create the D1 database, then paste the printed database_id into wrangler.toml
npx wrangler d1 create nlp-telemetry

# 2. Create the table (remote = the deployed DB, not a local copy)
npx wrangler d1 execute nlp-telemetry --remote --file schema.sql

# 3. Deploy the worker -> prints https://nlp-telemetry.<your-subdomain>.workers.dev
npx wrangler deploy     # or: npm run deploy
```

Then paste that URL into `ENDPOINT` in `../src/telemetry/telemetry.ts`, rebuild the
extension, and republish. Until the URL is set, the extension sends nothing.

Quick sanity check after deploy:

```bash
curl https://nlp-telemetry.<your-subdomain>.workers.dev      # -> "nlp telemetry ok"
```

## Reading the data (plain SQL)

```bash
# unique users (all time)
npx wrangler d1 execute nlp-telemetry --remote \
  --command "SELECT count(DISTINCT machine_id) AS users FROM events"

# event counts
npx wrangler d1 execute nlp-telemetry --remote \
  --command "SELECT event, count(*) AS n FROM events GROUP BY event ORDER BY n DESC"

# version adoption (unique users per extension version)
npx wrangler d1 execute nlp-telemetry --remote \
  --command "SELECT version, count(DISTINCT machine_id) AS users FROM events GROUP BY version ORDER BY users DESC"

# analyzer run mode split
npx wrangler d1 execute nlp-telemetry --remote \
  --command "SELECT json_extract(props,'$.mode') AS mode, count(*) AS n FROM events WHERE event='analyzer.run' GROUP BY mode"

# active users in the last 7 days
npx wrangler d1 execute nlp-telemetry --remote \
  --command "SELECT count(DISTINCT machine_id) AS wau FROM events WHERE ts > (strftime('%s','now')-7*86400)*1000"

# recent errors
npx wrangler d1 execute nlp-telemetry --remote \
  --command "SELECT event, props, count(*) n FROM events WHERE is_error=1 GROUP BY event, props ORDER BY n DESC LIMIT 20"

# most-used commands (counts are batched, so sum the 'n' metric, don't count rows)
npx wrangler d1 execute nlp-telemetry --remote \
  --command "SELECT json_extract(props,'\$.id') AS cmd, sum(json_extract(metrics,'\$.n')) AS uses, count(DISTINCT machine_id) AS users FROM events WHERE event='command' GROUP BY cmd ORDER BY uses DESC LIMIT 40"

# features nobody uses: commands in package.json that never appear above
#   -> compare that list against contributes.commands

# can users compile locally? (the case for the cloud compile service)
npx wrangler d1 execute nlp-telemetry --remote \
  --command "SELECT json_extract(props,'\$.reason') AS stage, count(DISTINCT machine_id) AS users, count(*) AS n FROM events WHERE event='compile.failed' GROUP BY stage ORDER BY n DESC"

# cloud compile: cache-hit rate and how long users wait for a runner
npx wrangler d1 execute nlp-telemetry --remote \
  --command "SELECT json_extract(props,'\$.platform') AS plat, json_extract(props,'\$.cached') AS cached, count(*) AS n, round(avg(json_extract(metrics,'\$.build'))/1000.0,1) AS avg_build_s FROM events WHERE event='compile.cloud.done' GROUP BY plat, cached"

# where analyzer time actually goes, by run mode
npx wrangler d1 execute nlp-telemetry --remote \
  --command "SELECT json_extract(props,'\$.runMode') AS mode, count(*) AS runs, round(avg(json_extract(metrics,'\$.secs')),2) AS avg_s, round(avg(json_extract(metrics,'\$.kb')),2) AS avg_kb_s, round(avg(json_extract(metrics,'\$.exec')),2) AS avg_exec_s FROM events WHERE event='analyzer.done' GROUP BY mode"

# analyzer failure rate
npx wrangler d1 execute nlp-telemetry --remote \
  --command "SELECT (SELECT count(*) FROM events WHERE event='analyzer.failed') AS failed, (SELECT count(*) FROM events WHERE event='analyzer.done') AS ok"

# install / upgrade / relaunch mix, and which engine versions are in the field
npx wrangler d1 execute nlp-telemetry --remote \
  --command "SELECT json_extract(props,'\$.launch') AS launch, count(DISTINCT machine_id) AS users FROM events WHERE event='extension.activated' GROUP BY launch"
npx wrangler d1 execute nlp-telemetry --remote \
  --command "SELECT engine, arch, count(DISTINCT machine_id) AS users FROM events WHERE engine IS NOT NULL GROUP BY engine, arch ORDER BY users DESC"

# engagement: commands issued per session
npx wrangler d1 execute nlp-telemetry --remote \
  --command "SELECT round(avg(cmds),1) AS avg_cmds_per_session FROM (SELECT session_id, sum(json_extract(metrics,'\$.n')) AS cmds FROM events WHERE event='command' GROUP BY session_id)"
```

> The `\$` escaping above is for bash. In PowerShell use `'$.id'` directly, or
> put the SQL in a file and use `--file`.

## Notes

- **Free tier headroom**: D1 gives 100k writes/day and 5M row reads/day free — far
  more than a small extension needs.
- **The endpoint is public** (the URL ships inside the extension bundle). That's
  normal for client telemetry, but it means anyone could POST junk. If that ever
  becomes a problem, add a Cloudflare **Rate Limiting** rule on the route, or a
  WAF rule, rather than a secret (a secret in the client isn't secret).
- **Housekeeping**: prune old rows if you like, e.g.
  `DELETE FROM events WHERE ts < (strftime('%s','now')-180*86400)*1000`.
