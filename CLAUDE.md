# Finance App (Disclosure Drift) — Project Context

## What this is
Tracks what AI-exposed companies report, how their filed language changes between filings, and what the market does about it — for Nicolas, reading it himself.

Built on:
- **Data layer** — committed JSON in `data/`, produced by the pipeline. No database.
- **Middleware** — none. Plain CommonJS scripts in `scripts/`, no dependencies, run by GitHub Actions.
- **Frontend** — one self-contained HTML file. No framework, no build step beyond string substitution.

**Deployment URL:** https://nicolassporrer-cmd.github.io/Finance-App/

**Sources:** SEC EDGAR (filings), SEC XBRL company facts (financials), Yahoo chart endpoint (prices), Finnhub (analyst ratings).

---

## Working with Nicolas

- Keep responses concise — no verbose summaries or narration of what you just did
- **Never render a value that was not sourced.** Unknown means an explicit dash, never a plausible-looking placeholder. Fabricated data that looks real is indistinguishable from a bug.
- **Verify by asserting on the data, not by looking at the UI.** Every serious bug in this project so far looked correct on screen: sections that parsed cleanly but resolved to the wrong Part, term counts silently zeroed by word-splitting, revenue six years stale from the wrong XBRL tag. Print the values, check the counts, reload.
- He is not an engineer but reads results closely and asks precise questions. Give the real number and the honest limitation rather than a reassuring summary. When something cannot be done, say so plainly and offer the nearest workable thing.
- QA checklists after deploying must be **numbered prescriptive steps organized by Part** (Part 1: Feature works, Part 2: Data layer, Part 3: Edge cases, Part 4: Regressions) — never bullet circles

---

## Files in this repo

| File | Purpose |
|------|---------|
| `CLAUDE.md` | This file — project bible |
| `BACKLOG.md` | Prioritized feature backlog |
| `JOURNAL.md` | Append-only build log — why the app is the way it is (rebuild spec) |
| `.claude/commands/*.md` | `/plan`, `/feature`, `/qa`, `/sync`, `/improve-prompt` |
| `scripts/lib/sec.cjs` | Rate-limited EDGAR client, user-agent enforcement, `.env` loading |
| `scripts/lib/text.cjs` | Filing HTML → text. Tag-aware, see gotchas |
| `scripts/lib/sections.cjs` | Locates Risk Factors / MD&A / Business by title |
| `scripts/lib/fiscal.cjs` | Fiscal period labels and Q4 reconstruction |
| `scripts/fetch-*.cjs` | The pipeline stages |
| `scripts/build-mock-payload.cjs` | Assembles the single JSON the page reads |
| `scripts/build-site.cjs` | Inlines the payload into the template → `dist/index.html` |
| `site/template.html` | The page, with a `__PAYLOAD__` placeholder |
| `docs/` | Design exploration, not part of the build |

---

## Development workflow

**Design before building** — complete all requirements discussion and get explicit agreement before writing any files. This includes tooling and workflow changes.

**Mockup first** — if UI changes are involved, render mockups and iterate until all states (default, loading, empty, error, edge cases) are agreed before writing code. Iterate on the mock many times; deploy once for QA sign-off.

**Lifecycle:** `/plan` → `/feature` → `/qa` → `/sync`

- `/feature` automatically calls `/qa` after deploying — do not skip
- `/sync` is the session closer: commits, pushes, updates docs

**Branch rules:**
- Feature work: create `feature/<slug>` before any changes; never work directly on `main`
- Config/doc updates: work directly on `main`
- Merge conflict: stop, explain what's conflicting, show both versions, ask how to resolve

---

## Building conventions

1. **No gold-plating.** Three similar lines beats a premature abstraction.
2. **No unnecessary error handling.** Validate at system boundaries only — here that means every external response.
3. **Comment the non-obvious why.** In this codebase that mostly means naming the trap a line is defending against, with the concrete case that exposed it.
4. **Extend, never replace.** Payload fields are additive; the page must tolerate a field being absent.
5. **Normalize at the boundary.** Filing HTML becomes text once, XBRL becomes typed series once. Downstream code never re-parses.
6. **Graceful degradation.** Missing data renders an explicit empty state naming *why* it is missing, never a silent gap and never a substituted value.
7. **No hardcoded credentials.** `SEC_USER_AGENT` and `FINNHUB_API_KEY` live in `.env` (gitignored) and repo secrets.
8. **Derived values are labelled derived.** EBITDA, free cash flow and reconstructed Q4s are not filed figures and must never be presented as if they were.

---

## Data integrity rules

1. **Absent stays absent.** No nearest-available fallback, no interpolation, no carrying a previous period forward. If the comparison period was not filed, say so.
2. **Every displayed number names its period.** A figure without its fiscal label is unverifiable.
3. **Restatements: keep the most recently filed version** of any period, never the first seen.
4. **Idempotent runs.** Re-running the pipeline on unchanged inputs produces an unchanged `data/`, so the daily job commits nothing.
5. **Derived series carry a `derived` flag** through to the page so the UI can mark them.

---

## Deployment

```
node scripts/build-site.cjs      # writes dist/index.html
```

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes to Pages.

**What deploy does:**
1. Checks out the tip of `main` (never the triggering SHA — the refresh commits *after* its run starts)
2. `node scripts/build-site.cjs`
3. Fails if `dist/index.html` is missing or empty
4. Uploads and deploys the Pages artifact

`.github/workflows/daily-refresh.yml` runs the whole pipeline at 07:25 UTC, commits `data/` if anything changed, then calls `deploy.yml` directly — a push made with `GITHUB_TOKEN` does not trigger other workflows.

**Required repo secrets:** `SEC_USER_AGENT` (job fails loudly without it), `FINNHUB_API_KEY` (optional).

---

## Data layer

`data/*.json`, each stage feeding the next:

| File | Produced by | Contains |
|------|-------------|----------|
| `watchlist.json` | hand-edited | tickers to track |
| `cik-map.json` | fetch-filings | ticker → CIK, refreshed weekly |
| `filings.json` | fetch-filings | every 10-K/10-Q/8-K/20-F/6-K per company |
| `language.json` | extract-sections | per filing: word count, section sizes, term frequencies |
| `diffs.json` | diff-sections | added / reworded / dropped sentences vs the prior filing |
| `financials.json` | fetch-financials | revenue, margins, EBITDA, FCF, quarterly and annual |
| `prices.json` | fetch-prices | daily closes plus the move around each filing |
| `consensus.json` | fetch-consensus | analyst ratings; empty file when no key |
| `mock-payload.json` | build-mock-payload | the single object the page reads |

`data/raw/` and `data/raw-xbrl/` are gitignored source caches (~250 MB combined).

---

## Known gotchas

Document surprises as they're discovered. Format: **what breaks**, why it breaks, how to fix or avoid it.

### This project

- **`www.sec.gov` returns 403 on the very first request** without a `User-Agent` of the form `AppName email@host`. The message says "Request Rate Threshold Exceeded", which is misleading — it is not rate limiting. `data.sec.gov` is laxer, so a pipeline can look half-working.
- **EDGAR wraps individual letters in their own tags for kerning.** Replacing every tag with a space splits words from the inside: Microsoft's heading becomes `RIS K FACTORS`, and `data center` becomes `data cente r` and stops matching. Breaks heading detection *and* silently corrupts every phrase count. Fix: block tags and table cells → whitespace, inline tags → nothing.
- **Item numbers are not unique within a filing.** A 10-Q has Item 2 twice: Part I is MD&A, Part II is Unregistered Sales. Last-match-wins silently drops MD&A while parsing cleanly. Splitting on `PART` first is also wrong — Microsoft prints "PART I" 79 times as a running page header, so last-wins puts the boundary near the *end* of Part I. Fix: match section **titles**, and distinguish the real section from its table-of-contents entry by taking the longest body.
- **XBRL: a 10-Q reports the quarter AND year-to-date** under the same `form` and `fp`. NVIDIA Q3 FY2026 carries both 90-day $57.0B and 272-day $147.8B. Filter on actual duration in days.
- **XBRL: there is no correct tag preference order.** NVIDIA's live revenue is in `Revenues` (its `RevenueFromContract…` stopped in 2022); Microsoft is the exact reverse. Any hard-coded order returns years-stale figures for one of them. Select the tag reporting most recently.
- **XBRL `fy`/`fp` describe the filing, not the period.** NVIDIA's 2024, 2025 and 2026 year-ends all carry `fy2026`. Never label a chart from them; derive from the fiscal year end instead.
- **No company files a Q4 10-Q.** Q4 exists only inside the annual figure, so a quarterly series taken straight from XBRL silently omits one quarter in four. Reconstruct as FY − Q1 − Q2 − Q3 and flag it.
- **Most large filers never tag a combined D&A** — Microsoft, Alphabet, Broadcom, Oracle and TSMC report the components separately, so there is no EBITDA without summing `Depreciation` + `AmortizationOfIntangibleAssets`.
- **Positional look-backs are wrong on sparse series.** "Four entries back" landed on Q2'22 in a cash-flow series with gaps while the label still said year-on-year. Match the comparison period by date.
- **The latest filing is usually an 8-K, not a report.** A freshness marker keyed to "latest filing" stars companies whose reported figures have not moved. Key it to 10-K/10-Q/20-F.
- **Stooq cannot be scripted** — it serves a JavaScript proof-of-work bot challenge. **Yahoo `quoteSummary` returns 401** without a session crumb. **Alpha Vantage free tier is ~25 calls/day.** Yahoo's `chart` endpoint is keyless and works.
- **Finnhub free tier: ratings yes, price targets no** (403), and only four months of history.
- **Node's CJS resolver does not auto-try `.cjs`.** `require('./lib/sec')` throws MODULE_NOT_FOUND — always write the extension.
- **Node is Windows-native and cannot resolve Git Bash paths** like `/tmp`. Pass it real Windows paths.

### General

- **Don't let a background agent delegate a bounded data-fetch task to further sub-agents.** Dispatching a general-purpose background agent for a well-defined, bounded pull (e.g., "fetch all X from API Y") risks a runaway sub-agent chain if the agent misreads its own tool-call results, wrongly concludes there's a platform bug, and spawns further agents to "verify." Those sub-agents often can't be force-killed by anyone except their direct parent — `TaskStop` can fail with an ownership restriction, leaving `SendMessage` as the only lever. Fix: do bounded, well-understood API pulls directly in the main session.
  - **If delegation is still the right call**, explicitly forbid nested spawning in the prompt: *"Do NOT spawn any sub-agents or delegate any part of this to another agent — do all the work yourself directly. If you're ever unsure whether a result looks right, just note the uncertainty in your final reply — do not launch a 'verification' sub-agent."*
- **Never batch two read calls to the same MCP server in one message — their results can clobber each other.** Both tool results may come back identical (typically whichever query resolved last), silently returning the wrong data for one. Not limited to two calls of the *same* tool. Fix: sequence reads to the same server one message at a time.
- **For very high-volume gather work, delegate to parallel sub-agents that each write structured JSON to disk, then assemble with a script.** Reading it all inline guarantees a mid-task context compaction and silent quality loss. Give every worker a shared spec file + context file on disk, have each write its full extraction to its own `scratchpad/*.json` and return only a short summary, then merge deterministically. Caveat: the orchestrator never personally reads the raw source — disclose that trade-off.
- **A tool installed mid-session stays invisible until Claude Code is restarted.** The running process keeps the environment it inherited at launch. Fix: quit and reopen after installing a tool. To confirm the install landed, check the binary directly (`Test-Path "C:\Program Files\nodejs\node.exe"`) rather than trusting `node --version`; if a command must run before restarting, invoke it by absolute path.
