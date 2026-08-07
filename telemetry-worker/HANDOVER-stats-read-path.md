# Hand-over: how visualtext.org/vscode-activity-stats gets its numbers

**Written** 2026-08-07, from the `vscode-nlp` repository side. Figures refreshed 18:30 UTC.
**For** the session with access to the visualtext.org WordPress install.
**Read §0 first.** It is the only part that blocks anything; §6a can wait weeks.
**Supersedes the premise of** `HANDOVER-wordpress-shortcodes.md`, which assumed the stats page did not exist yet. It does, it works, and it is rendering live data. The open question is no longer *what to build* — it is *how the data is currently getting out of the database*, because the documented path does not exist.

---

## 0. The one thing to find out

**How does the WordPress page read the D1 database?**

Everything else in this document depends on that answer, and I could not determine it from outside.

What I verified from this side, today:

| Check | Result |
|---|---|
| `GET https://nlp-telemetry.dehilster.workers.dev/` | `nlp telemetry ok` |
| `GET https://nlp-telemetry.dehilster.workers.dev/stats` | `nlp telemetry ok` — the same catch-all. **No read route exists.** |
| `npx wrangler deployments list` | Latest deployment **2026-07-30T15:53Z**, matching the write-only `worker.js` in this repo |
| Page source | Rendered **server-side**. No `fetch()`, no XHR, no endpoint or token visible in the HTML |

The worker is write-only by construction. Its entire `fetch` handler is: `GET` → health check string, `POST` → insert a row, anything else → 405. There is no code path that returns data.

So the numbers are reaching WordPress another way. The two plausible candidates:

1. **A Cloudflare API token on the WordPress server**, with PHP calling D1's REST API directly.
2. **A second worker** on a different hostname, whose source is not in this repository.

### Why this matters if it is (1)

A Cloudflare D1 REST token is **not scoped to one database**. It can read *and write* every database on the account. WordPress — with a theme, plugins, and a public login — is a far larger attack surface than a worker that does one thing.

That is not hindsight; it is what the earlier hand-over said before any of this was built:

> Do not put a Cloudflare account API token on the WordPress server. A D1 REST token is broad — it can read and write every database on the account, and WordPress is a much larger attack surface than a worker.

### How to find out

On the WordPress host, search for any of these:

```bash
grep -ril "api.cloudflare.com" .
grep -ril "cloudflare" wp-config.php wp-content/themes wp-content/plugins wp-content/mu-plugins
grep -ri  "18a15af7-27c3-44b6-941e-b914fc60e1be" .     # the D1 database id
grep -ril "nlp-telemetry" .
grep -ril "workers.dev" .
```

Also check the database, since tokens are often stored as options rather than in files:

```sql
SELECT option_name, LEFT(option_value, 80) FROM wp_options
WHERE option_value LIKE '%cloudflare%'
   OR option_value LIKE '%api.cloudflare%'
   OR option_name  LIKE '%cloudflare%';
```

Then find the shortcode itself. The page renders tables titled *Daily Active Machines*, *Extension Versions in Use*, *Operating Systems*, *Platform and Architecture*, *NLP++ Engine Versions*, *Most Used Commands*, *Analyzer Metrics*, *Component Downloads* and *Events Recorded* — so grep the theme's `functions.php`, any custom or mu-plugin, and `wp_posts` for `add_shortcode`.

**Report back what you find before changing anything.** The page works today; the goal is to make the read path safe and reviewable, not to rebuild it.

---

## 1. Do not break what is already right

Whoever built this page did it carefully. Preserve these properties through any change:

- **Aggregates only.** Nothing per-`machine_id` or per-`session_id`, and no raw row dump.
- **Small buckets are suppressed** — the page says *"18 smaller groups hidden"*. With 165 machines, a bucket of one is effectively a name. Keep the floor.
- **The disclaimers stay.** *"These are machines, not people"*, and the note that telemetry is opt-out via two independent settings. Both are accurate and both matter.

---

## 2. The fix, if a token is on the WordPress server

The destination is the design the earlier document specified, and the work splits across two repositories.

### 2a. In `vscode-nlp` (not on the website)

`telemetry-worker/worker.js` gains a `GET /stats` route returning one pre-aggregated JSON blob. Rules for it:

- **Fixed queries only.** Never accept SQL, a table name, a column name or a LIMIT from the query string. The aggregates are the whole menu.
- **Read-only by construction** — the route only ever issues `SELECT`.
- **Cache hard.** The endpoint is public: the worker URL ships inside the extension bundle, so anyone can hit it. Use the Cloudflare Cache API in the worker (or `s-maxage`), plus a WordPress transient of 1–6 hours.
- **Apply the small-bucket floor in the worker**, so it holds for every consumer rather than depending on each caller.

The SQL is already written — see §4 of `HANDOVER-wordpress-shortcodes.md` in this same directory, plus the query set in `telemetry-worker/README.md`.

**Ask the vscode-nlp side to do this part.** The worker's source is version-controlled there and deployed with `npx wrangler deploy` from `telemetry-worker/`. Changing it from the website side would put production out of sync with the repository, which is how this situation arose.

### 2b. On the website

Replace the direct D1 call with a cached `wp_remote_get` against `https://nlp-telemetry.dehilster.workers.dev/stats`, then `json_decode`. No credentials on the WordPress side at all.

Afterwards: **revoke the Cloudflare token** in the Cloudflare dashboard. Removing it from the code is not the same as revoking it — assume anything that sat in a web root is compromised.

---

## 3. The fix, if it is a second worker

Smaller, but still worth closing: that worker's source is not in version control, so nobody can review the SQL it runs or redeploy it if it breaks.

Get the source into `vscode-nlp` alongside `telemetry-worker/worker.js` — either as a second worker directory or, preferably, folded into the existing worker as the `/stats` route so there is one deployable with one config. Note its hostname and its Cloudflare project name in the reply so the vscode-nlp side can wire it up.

---

## 4. Numbers to check your work against

I read these from D1 directly on 2026-08-07. The page agreed with the 13:15 UTC reading exactly, which is how I know it is live rather than cached from a snapshot:

| | 13:15 UTC | 18:30 UTC |
|---|---|---|
| Total events | 2,620 | **2,632** |
| Distinct machines | 165 | **169** |
| Database size | ~1.02 MB | ~1.05 MB |
| Earliest data | 2026-07-11 | 2026-07-11 |

A `count(*)` is a full scan — about 2,600 row reads.

At this size, live aggregation is comfortably viable — D1's free tier allows 5M row reads per day, so a full scan costs about 0.05% of the daily budget. **Caching is needed to survive traffic, not to survive the query.** Do not build a pre-aggregated summary table; it is not warranted yet.

If the page still shows the same totals after a change, the read path is intact.

---

## 5. Four ways to get the numbers silently wrong

These apply to any query you write or move. Each produces a plausible-looking chart that is simply false.

**5.1 — `command` and `language` events are batched.** The extension buffers them and flushes one row per distinct id per minute, carrying an `n`. One row can mean 300 uses. Counting rows undercounts by an arbitrary, varying factor.

```sql
-- WRONG
SELECT json_extract(props,'$.id') AS cmd, count(*) FROM events WHERE event='command' GROUP BY cmd;

-- RIGHT
SELECT json_extract(props,'$.id') AS cmd,
       sum(json_extract(metrics,'$.n')) AS uses,
       count(DISTINCT machine_id)       AS machines
FROM events WHERE event='command' GROUP BY cmd ORDER BY uses DESC;
```

The page's "Most Used Commands" currently shows `logView.refreshAll` at 2,512 uses across 52 machines — a uses-to-machines ratio that only makes sense if it is summing `n` correctly. Preserve that.

**5.2 — `ts` is in milliseconds.** Day bucketing needs `date(ts/1000,'unixepoch')`. Without the divide you get dates in the year 56000 and an empty chart.

**5.3 — Failure rate is not `analyzer.failed / analyzer.run`.** `run` fires *before* the engine starts; `done` and `failed` fire after. A run whose host was killed emits `run` and nothing else, so `run >= done + failed` always and the gap is not failures. Compare outcomes only against outcomes. The page currently shows 132 started, 15 completed, 10 failed — that gap is expected and is not a 90% failure rate.

**5.4 — Two names are overloaded across events.** `kb` means KB-load *seconds* in `analyzer.done` but payload *kilobytes* in `compile.cloud.done`; `engine` is a version string as a column but startup *seconds* as an `analyzer.done` metric. Always filter by `event` before touching `metrics`.

---

## 6. Two caveats about the data itself

- **It starts 2026-07-11.** There is no history before that.
- **`command` and `language` events only exist for extension 3.12.0+.** Any chart spanning that boundary shows rollout, not growth. Label the period rather than implying history that is not there.

---

## 6a. Two new metrics — published, but not yet worth a panel

Extension **3.12.8 was published to the Marketplace on 2026-08-07 at 18:04 UTC** and records **which of the shipped analyzers and templates people use**. The page cannot show this today because the fields did not exist when its queries were written.

**Do not build the panel yet — there is nothing in it.** As of 18:30 UTC, half an hour after publication:

| | |
|---|---|
| Machines on 3.12.8 | **3** (of ~169 seen, ~6,335 installed) |
| Events from 3.12.8 | 6 — all `extension.activated` and `format.document` |
| Runs carrying `example` | **0** |
| `analyzer.created` events | **0** |

Those zeros mean "nobody on the new version has run or created an analyzer yet", not "the field is broken" — the three machines have activated and formatted a document, nothing more.

Nothing is retroactive, and adoption is the limiting factor: 3 machines of 6,335 installs in the first half hour. For the first couple of weeks these numbers will describe *who upgrades quickly* rather than what is popular. Run this before building anything, and build when it returns something worth showing:

```sql
SELECT count(*) FROM events WHERE json_extract(props,'$.example') IS NOT NULL;
```

### The fields

| Event | New field | Meaning |
| --- | --- | --- |
| `analyzer.run` | `props.example` | The analyzer's name — **only when it is one the extension ships**. Absent for a user's own analyzer. |
| `analyzer.created` (new event) | `props.template` | Which shipped template was chosen. Several blocks combine as `A+B+C`, sorted. |
| | `props.blocks` | How many blocks were combined, as a string. `1` means "chose this template"; more means "assembled from parts on top of Bare Minimum". |

The values are folder names from two public repositories — `analyzer-templates` (Address Parser, Bare English, Bare Minimum, Date and Times, Email Addresses, Knowledge Base, NLPPlus Interface, Paragraphs Sentences, parse-en-us, Telephone Numbers, URLs, xout) and the `analyzers` repo (corporate, files, nlp-tutorials, nlpfix-analyzers, parse-en-us). The extension derives the list from the folders it downloads, so new templates appear without an extension release, and the list above will drift.

### The one thing to get right

**A missing `example` is not "unknown" — it means the user was running their own analyzer.** That is a real, reportable number, and mislabelling it as unknown or dropping it silently would misrepresent the split. Present it as its own row:

```sql
-- Shipped examples vs a user's own work
SELECT COALESCE(json_extract(props,'$.example'), '(their own analyzer)') AS analyzer,
       count(*)                   AS runs,
       count(DISTINCT machine_id) AS machines
FROM events
WHERE event = 'analyzer.run'
GROUP BY analyzer
ORDER BY machines DESC, runs DESC;
```

### Which templates people start from

```sql
SELECT json_extract(props,'$.template')       AS template,
       CAST(json_extract(props,'$.blocks') AS INTEGER) AS blocks,
       count(*)                   AS created,
       count(DISTINCT machine_id) AS machines
FROM events
WHERE event = 'analyzer.created'
GROUP BY template, blocks
ORDER BY created DESC;
```

Combinations arrive as a single `A+B` string. If the interesting question is "how often is each block used", split on `+` in PHP after the query rather than in SQL — SQLite has no split function and simulating one is not worth it at this data size.

### Keep the existing safeguards

Both panels are subject to §1: aggregate only, and keep the small-bucket floor. With 165 machines a template chosen once is close to identifying, and `(their own analyzer)` should never be broken down further.

---

## 7. Reference

- **Worker source, schema, deploy steps, example queries:** `telemetry-worker/` in `github.com/VisualText/vscode-nlp`
- **Endpoint:** `https://nlp-telemetry.dehilster.workers.dev` — write-only as deployed
- **Cloudflare account:** dehilster@gmail.com. D1 database `nlp-telemetry`, id `18a15af7-27c3-44b6-941e-b914fc60e1be`
- **Event inventory and full schema:** `HANDOVER-wordpress-shortcodes.md`, §1 and §2, in this directory
- **Privacy contract the extension makes to users:** the `# Telemetry` section of the extension `README.md`, and `SECURITY.md` in the repository root

---

## 8. What to reply with

1. **How the page reads D1** — token in PHP, second worker, or something else.
2. **If a token:** where it was stored, and what scopes it has in the Cloudflare dashboard.
3. **If a second worker:** its hostname and Cloudflare project name.
4. **Where the shortcode lives** — file path and shortcode tag.

That is enough for the vscode-nlp side to build the `/stats` route to match, so the swap is a one-line change on the website.

**Do §0–§3 first.** The new metrics in §6a are additive and can wait; the read path is the part with a security question attached, and it is also the part that decides where the §6a queries should live. If the answer is "a `/stats` route", the two new panels belong in that route rather than being added to whatever runs today and then moved.
