# NLP++ telemetry worker

A tiny Cloudflare Worker that records anonymous usage pings from the NLP++ VS Code
extension into a D1 (SQLite) database. No Azure, no credit card — runs on
Cloudflare's free tier.

It receives only anonymous counts/metadata: event name, extension + VS Code
version, platform, an anonymized `machineId`, and small numeric measurements.
Never any file contents, names, or paths.

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
```

## Notes

- **Free tier headroom**: D1 gives 100k writes/day and 5M row reads/day free — far
  more than a small extension needs.
- **The endpoint is public** (the URL ships inside the extension bundle). That's
  normal for client telemetry, but it means anyone could POST junk. If that ever
  becomes a problem, add a Cloudflare **Rate Limiting** rule on the route, or a
  WAF rule, rather than a secret (a secret in the client isn't secret).
- **Housekeeping**: prune old rows if you like, e.g.
  `DELETE FROM events WHERE ts < (strftime('%s','now')-180*86400)*1000`.
