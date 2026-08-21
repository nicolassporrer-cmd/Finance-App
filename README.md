# Finance App — Disclosure Drift

Tracks what AI-exposed companies **report**, how their **filed language** changes, and what the **market** does about it. All data comes from primary sources: SEC EDGAR and XBRL, Yahoo daily closes, and Finnhub for analyst ratings.

Live: https://nicolassporrer-cmd.github.io/Finance-App/

## What it does

Pick a company from the board, then read it end to end across three sheets:

1. **Financials** — revenue by fiscal quarter, margins, free cash flow, from SEC XBRL company facts.
2. **Language** — sentences added, reworded and dropped in Risk Factors and MD&A versus the previous filing of the same form.
3. **Market** — share price with filing dates marked, the move around each filing, analyst consensus, and a dynamics summary.

## Running it locally

Node 20+. No dependencies.

```bash
cp .env.example .env      # then fill in SEC_USER_AGENT
npm run refresh           # fetch everything (slow: downloads ~75 filings)
npm run build             # writes dist/index.html
```

`SEC_USER_AGENT` is **required**, in the form `Finance-App you@example.com`. Without it `www.sec.gov` returns 403 on the very first call — this is not rate limiting, it is SEC's fair-access policy. `FINNHUB_API_KEY` is optional; without it the consensus panel renders an explicit empty state.

Both are read from `.env` locally and from repo secrets in Actions. `.env` is gitignored.

## Traps this code already works around

Each of these produces plausible-looking wrong numbers rather than an error, so none of them announce themselves.

**Document parsing**

- EDGAR wraps individual letters in their own tags for kerning. Replacing every tag with a space splits words from the inside — `RIS K FACTORS` — which breaks heading detection *and* silently corrupts every phrase count, because `data cente r` stops matching. Block tags become whitespace; inline tags become nothing.
- Item numbers are not unique within a filing. A 10-Q has Item 2 twice: Part I is MD&A, Part II is Unregistered Sales. Last-match-wins silently drops MD&A. Splitting on `PART` is also wrong — Microsoft prints "PART I" 79 times as a running page header. Sections are located by **title**, and the real section is told from its table-of-contents entry by taking the longest body.
- Filers spell terms differently. Microsoft writes "datacenter", NVIDIA "data center"; without normalising, Microsoft scores zero on a term it uses constantly.

**XBRL**

- A 10-Q reports the quarter **and** year-to-date under the same `form` and `fp`. NVIDIA's Q3 FY2026 carries both a 90-day $57.0B and a 272-day $147.8B. Series are filtered on actual duration in days.
- There is no correct tag preference order. NVIDIA's live revenue is in `Revenues` while its `RevenueFromContract…` tag stopped in 2022; Microsoft is the exact reverse. Tags are selected by which reports **most recently**.
- `fy` and `fp` describe the fiscal year of the *filing that reported the fact*, not the period it covers, so NVIDIA's 2024, 2025 and 2026 year-ends all carry `fy2026`. Period labels are derived from each company's fiscal year end instead.
- No company files a Q4 10-Q — Q4 exists only inside the annual figure. It is reconstructed as full year minus Q1–Q3 and flagged `derived`.
- EBITDA and free cash flow are not GAAP concepts; both are derived and labelled as such. Most large filers never tag a combined D&A, so it is rebuilt from `Depreciation` + `AmortizationOfIntangibleAssets`.

**Prices and consensus**

- Stooq serves a JavaScript proof-of-work bot challenge and cannot be scripted. Alpha Vantage's free tier is ~25 calls/day. Yahoo's chart endpoint needs no key and is what is used.
- Yahoo's `quoteSummary` (analyst data) now returns 401 without a session crumb, which is why consensus needs Finnhub at all.
- Finnhub's free tier gives ratings for all 15 names but **not** price targets, which return 403.
- Filing reaction is measured from the last close **before** the filing, because filings land outside market hours.

## Layout

```
data/          committed JSON the page reads (raw/ and raw-xbrl/ are gitignored)
scripts/       the pipeline, plain CommonJS, no dependencies
  lib/         sec, text, sections, fiscal helpers
site/          the page template, with a __PAYLOAD__ placeholder
docs/          design exploration, not part of the build
```

`npm run build` inlines the dataset into the template and writes `dist/index.html` — one self-contained file, nothing fetched at runtime.
