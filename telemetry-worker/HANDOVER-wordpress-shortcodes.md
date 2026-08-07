# Hand-over: visualtext.org telemetry shortcodes

**Written** 2026-07-30, from the vscode-nlp repo side.
**For** the session with access to the visualtext.org WordPress install.
**Subject** the NLP++ extension telemetry backend was greatly expanded in extension **v3.12.0** (published to the marketplace 2026-07-30). Any shortcode that renders telemetry needs updating, and there is a structural blocker to resolve first.

---

## 0. Read this first: there is no read API

**The telemetry worker is write-only.** `telemetry-worker/worker.js` has exactly three behaviours:

| Request | Response |
| --- | --- |
| `GET /` | `nlp telemetry ok` — a plain-text health check. No data. |
| `POST /` (JSON body) | Inserts one row into D1, returns `204`. |
| Anything else | `405` |

So whatever the existing shortcodes render, **they are not reading it from `nlp-telemetry.dehilster.workers.dev`** — that endpoint cannot return data. Before writing any code, establish which of these is actually true:

1. **The shortcodes display something else entirely** (marketplace install counts, GitHub release download counts, hand-maintained numbers). Very possible — this telemetry backend only went live 2026-07-11 and collected five event types until now. If so, this is a *new build*, not an update.
2. **They query Cloudflare's D1 REST API directly from PHP.** Check for a Cloudflare API token in `wp-config.php`, a plugin's settings table, or an options row.
3. **There is a second worker or endpoint** not in this repo.

Grep the WordPress tree for `nlp-telemetry`, `workers.dev`, `cloudflare`, `d1`, and the shortcode tags themselves before assuming anything.

### Recommended read path

Do **not** put a Cloudflare account API token on the WordPress server. A D1 REST token is broad — it can read and write every database on the account, and WordPress is a much larger attack surface than a worker.

Instead, **add a read endpoint to the existing worker**: a `GET /stats` route returning a fixed, pre-aggregated JSON blob, with the SQL living in `worker.js` where it can be reviewed. Then the shortcode is a cached `wp_remote_get()` + `json_decode()`, with no credentials on the WordPress side at all.

Points to get right on that endpoint:

- **Fixed queries only.** Never accept SQL, a table name, or a column name from the query string. The aggregates below are the whole menu.
- **Cache hard.** Use the Cloudflare Cache API in the worker (or `s-maxage`) plus a WordPress transient of 1–6 hours. These numbers change slowly and D1's free tier allows 5M row reads/day — one uncached shortcode on a popular page will burn that.
- **Read-only by construction.** The route should only ever issue `SELECT`.
- Consider whether the numbers should be public at all — see §5.

---

## 1. Schema as it stands now

Table `events` in D1 database `nlp-telemetry` (id `18a15af7-27c3-44b6-941e-b914fc60e1be`). 13 columns, as of the 2026-07-30 migration:

| Column | Notes |
| --- | --- |
| `id` | autoincrement |
| `ts` | **epoch milliseconds**, server-side receive time. Not seconds — divide by 1000 for `strftime` comparisons. |
| `event` | event name, e.g. `command`, `analyzer.done` |
| `is_error` | `1` for failures, `0` otherwise |
| `version` | extension version, e.g. `3.12.0` |
| `vscode` | VS Code version |
| `platform` | `win32` / `darwin` / `linux` |
| `arch` | **new** — `x64` / `arm64` |
| `engine` | **new** — NLP++ engine version, once detected. NULL until the engine has been run once in that session. |
| `machine_id` | anonymised `vscode.env.machineId` |
| `session_id` | **new** — one VS Code window's lifetime |
| `props` | JSON text, string values. Read with `json_extract(props,'$.key')`. |
| `metrics` | JSON text, numeric values. Read with `json_extract(metrics,'$.key')`. |

`props` and `metrics` are each clamped to 512 characters at insert.

**Rows written before 2026-07-30 have NULL in `arch`, `engine`, and `session_id`.** Any `GROUP BY` on those three will show a large "unknown" bucket that is really just pre-migration history. Filter with `WHERE session_id IS NOT NULL` when the distinction matters.

---

## 2. Event inventory

Everything the extension can send. Events marked **batched** are the ones most likely to be mis-counted — see §3.

| Event | `props` | `metrics` |
| --- | --- | --- |
| `extension.activated` | `launch` (`install`/`upgrade`/`relaunch`), `from` (previous version, on upgrade only), `remote` (`local`/`wsl`/`ssh-remote`/…), `ui` (`desktop`/`web`), `lang` | — |
| `engine.detected` | — | — |
| `command` **batched** | `id` — the command id, e.g. `analyzerView.refreshAll` | `n` — occurrences since last flush |
| `command.error` | `reason` — `"<commandId>:<ErrorClass>"` | — |
| `language` **batched** | `id` — `hover`/`definition`/`references`/`rename`/`completion`/`signature` | `n` |
| `analyzer.run` | `mode` (`compiled`/`interpreted`), `runMode`, `devMode`, `target` (`file`/`directory`), `example` — **present only when the analyzer is one the extension ships**; absent for a user's own | — |
| `analyzer.created` | `template` (shipped template name, or several joined with `+`), `blocks` (how many were combined) | — |
| `analyzer.done` | same four as `analyzer.run` | `secs`, `setup`, `engine`, `kb`, `load`, `exec`, `post` (all **seconds**), `lazy` (file count) |
| `analyzer.failed` | `reason` — `syntax` / `exec` | `secs` |
| `compile.start` | `target` (`ANALYZER`/`KB_ONLY`/`ANALYZER_ONLY`), `mode` (`local`/`cloud`) | — |
| `compile.done` | same two | `ms` |
| `compile.failed` | `reason` — `"<mode>:<TARGET>:<stage>"`, stage ∈ `codegen`, `no-cmake`, `no-engine-libs`, `build` | `ms` |
| `compile.cloud` | `reason` — `no-dispatcher-url`, `no-engine-version`, `platform-unsupported`, `release-not-found`, `submit-<httpcode>`, `job-<status>`, `exception:<Class>` | `ms`, sometimes `build`, `kb` |
| `compile.cloud.done` | `platform`, `cached` (`yes`/`no`), `kbOnly` | `ms`, `build`, `download`, `kb` (**kilobytes**) |
| `deploy.done` | — | `lazy`, `py` |
| `deploy.failed` | `reason` — `no-library` / `copy:<Class>` | — |
| `update.download` | `component`, `version` | `ms` |
| `update.unzip` | `component` | — |
| `regression.run` | `command` (`test`/`bless`), `scope` (`file`/`folder`/`all`) | `files`, `passed`, `failed`, `missing`, `blessed` |
| `format.document` / `format.selection` | — | byte and edit counts |
| `format.error` | `reason` — `document` / `selection` | `bytes` |

Failure events set `is_error = 1` and put their reason in `props.reason`.

---

## 3. Gotchas that will silently produce wrong numbers

These are the reason this document exists. Each one yields a plausible-looking chart that is simply false.

**3.1 — `command` and `language` are batched. Counting rows undercounts, badly.**
The extension buffers these in memory and flushes one row per distinct id per minute, carrying an `n`. A user who clicks Refresh All 300 times in a minute produces **one row with `n=300`**.

```sql
-- WRONG: undercounts by an arbitrary, varying factor
SELECT json_extract(props,'$.id') AS cmd, count(*) FROM events WHERE event='command' GROUP BY cmd;

-- RIGHT
SELECT json_extract(props,'$.id') AS cmd,
       sum(json_extract(metrics,'$.n')) AS uses,
       count(DISTINCT machine_id)      AS users
FROM events WHERE event='command' GROUP BY cmd ORDER BY uses DESC;
```

`count(DISTINCT machine_id)` is unaffected by batching and is the more honest headline anyway — "how many people use this" beats "how many times was it clicked".

**3.2 — Command and language data only exists for 3.12.0+.**
Older clients never sent these events at all. A "most used commands" chart silently describes only the subset of users who have upgraded. Either scope it (`WHERE version >= '3.12.0'` — but note that's a *string* comparison, which breaks at 3.100.0) or label the chart with the period it covers. Do not compare a command's usage across the 3.12.0 boundary; it will look like explosive growth that is purely an artefact of rollout.

**3.3 — Do not compute failure rate as `analyzer.failed / analyzer.run`.**
`analyzer.run` fires *before* the engine starts; `analyzer.done` and `analyzer.failed` fire after. A run whose host was killed, or that is still going, emits `run` and nothing else. So `run` ≥ `done + failed` always, and the gap is not a failure.

```sql
-- RIGHT: outcomes compared only against outcomes
SELECT
  (SELECT count(*) FROM events WHERE event='analyzer.done')   AS ok,
  (SELECT count(*) FROM events WHERE event='analyzer.failed') AS failed;
```

**3.4 — Two metric names are overloaded across events. Always filter by `event` first.**

- `kb` means **KB-load seconds** in `analyzer.done`, but **payload kilobytes** in `compile.cloud.done`.
- `engine` is the **engine version string** as a top-level column, but **engine-startup seconds** as an `analyzer.done` metric.

Both are unambiguous as long as every query filters `WHERE event = '…'` before touching `metrics`. A query that aggregates across events will produce nonsense. This is a wart in the event design; it is documented rather than fixed because the format is now published and renaming would split the data.

**3.5 — Units are not uniform.** `analyzer.done` and `analyzer.failed` are in **seconds** (2 decimal places). `compile.*`, `update.*`, and `regression.run` are in **milliseconds**. Do not build one shared "duration" formatter.

**3.6 — `machine_id` is a machine, not a person.** One developer across a laptop, a desktop and a WSL instance counts as three. Label such figures "installations" or "active machines", never "users" — and certainly never "customers".

**3.7 — Every number is a lower bound.** Telemetry is opt-out and two independent settings disable it (VS Code's global `telemetry.telemetryLevel`, and `nlp.telemetry.enable`). Some unknown fraction of users is invisible. This matters most for anything phrased as a total.

**3.8 — `ts` is milliseconds.** Day bucketing needs `date(ts/1000,'unixepoch')`, not `date(ts,'unixepoch')`. The latter yields dates in the year 56000 and an empty chart.

---

## 4. Queries worth surfacing

Tested shapes, ready to drop into the worker's `/stats` route. Each is one aggregate; none scan more than the `events` table.

```sql
-- Active machines, 30 days
SELECT count(DISTINCT machine_id) AS active_30d
FROM events WHERE ts > (strftime('%s','now')-30*86400)*1000;

-- Version adoption
SELECT version, count(DISTINCT machine_id) AS machines
FROM events GROUP BY version ORDER BY machines DESC;

-- Platform / architecture mix (post-migration rows only)
SELECT platform, arch, count(DISTINCT machine_id) AS machines
FROM events WHERE arch IS NOT NULL GROUP BY platform, arch ORDER BY machines DESC;

-- Engine versions in the field
SELECT engine, count(DISTINCT machine_id) AS machines
FROM events WHERE engine IS NOT NULL GROUP BY engine ORDER BY machines DESC;

-- Top 20 commands (see 3.1)
SELECT json_extract(props,'$.id') AS cmd,
       sum(json_extract(metrics,'$.n')) AS uses,
       count(DISTINCT machine_id)      AS machines
FROM events WHERE event='command' GROUP BY cmd ORDER BY uses DESC LIMIT 20;

-- Language feature usage
SELECT json_extract(props,'$.id') AS feature,
       sum(json_extract(metrics,'$.n')) AS uses,
       count(DISTINCT machine_id)      AS machines
FROM events WHERE event='language' GROUP BY feature ORDER BY uses DESC;

-- Analyzer runs: compiled vs interpreted, with average wall time
SELECT json_extract(props,'$.mode') AS mode,
       count(*) AS runs,
       round(avg(json_extract(metrics,'$.secs')),2) AS avg_secs
FROM events WHERE event='analyzer.done' GROUP BY mode;

-- Compile outcomes by route
SELECT json_extract(props,'$.mode') AS route, count(*) AS ok
FROM events WHERE event='compile.done' GROUP BY route;

-- Why local compiles fail (the case for the cloud service)
SELECT json_extract(props,'$.reason') AS reason,
       count(*) AS n, count(DISTINCT machine_id) AS machines
FROM events WHERE event='compile.failed' GROUP BY reason ORDER BY n DESC;

-- Cloud compile health: cache hit rate and runner wait
SELECT json_extract(props,'$.platform') AS platform,
       json_extract(props,'$.cached')   AS cached,
       count(*) AS n,
       round(avg(json_extract(metrics,'$.build'))/1000.0,1) AS avg_build_secs
FROM events WHERE event='compile.cloud.done' GROUP BY platform, cached;

-- Daily active machines, 90-day sparkline
SELECT date(ts/1000,'unixepoch') AS day, count(DISTINCT machine_id) AS machines
FROM events WHERE ts > (strftime('%s','now')-90*86400)*1000
GROUP BY day ORDER BY day;
```

---

## 5. Before publishing any of this on a public page

The privacy contract the extension makes to users, in `README.md` and in `src/telemetry/telemetry.ts`, is that only anonymous counts and metadata are collected. Nothing in the schema violates that — there are no paths, file names, analyzer names, or error message texts anywhere in it, by construction.

But **collecting anonymously and publishing publicly are different decisions**, and users consented to the first. Two things to weigh:

- **Aggregate only.** Never render anything per-`machine_id` or per-`session_id`, and don't expose a raw row dump. With a small user base, a table of "recent errors by machine" is close to identifying individuals.
- **Small numbers identify.** `SELECT engine, arch, count(*)` is fine at scale, but a bucket containing one arm64 Linux machine on an unreleased engine build is effectively a name. Consider suppressing buckets below a floor (say `HAVING count(DISTINCT machine_id) >= 5`) on anything public.

If these numbers are for a public marketing page rather than an internal dashboard, that floor is worth applying by default in the worker rather than leaving it to each shortcode.

---

## 6. Open questions for whoever picks this up

1. **What do the existing shortcodes actually render, and where do they get it?** Resolve §0 first — it decides whether this is an update or a new build.
2. **Public page or logged-in admin view?** Drives §5 entirely.
3. **Which metrics does the site actually want?** §4 is a menu, not a spec.
4. **Who owns the `/stats` endpoint if it gets added?** It would live in `telemetry-worker/worker.js` in the `vscode-nlp` repo, deployed with `npx wrangler deploy` from that directory — i.e. a change on the extension side, not the WordPress side. Coordinate so the two don't drift.

## 7. Reference

- Worker source, schema, deploy steps, and further example queries: `telemetry-worker/` in `github.com/VisualText/vscode-nlp`.
- Endpoint: `https://nlp-telemetry.dehilster.workers.dev` (write-only today).
- Cloudflare account: dehilster@gmail.com. D1 database `nlp-telemetry`, id `18a15af7-27c3-44b6-941e-b914fc60e1be`.
- What the extension sends and from where: `src/telemetry/telemetry.ts`, plus call sites in `nlp.ts`, `compile.ts`, `visualText.ts`, `regression.ts`, `language/providers.ts`, `format/formatProvider.ts`.
- User-facing disclosure, which must stay in step with the schema: the `# Telemetry` section of the extension `README.md`.
