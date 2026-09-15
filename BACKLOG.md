# Backlog

Status: `now` · `next` · `later` · `done`

## now
- **Add `SEC_USER_AGENT` as a repo secret.** Value: `Finance-App nicolas.sporrer@gmail.com`. Until this exists the daily refresh fails at its first step — it did so 25 days running (2026-08-21 to 2026-09-15) while the site stayed live on frozen data. Claude cannot create secrets.

## next
- **Strip page numbers from extracted sentences.** One NVIDIA line reads "Other companies compete 31 with us" — the 31 is a page number.
- **Research radar (arXiv).** cs.AI / cs.CL / cs.LG / cs.MA crossed with econ.GN and q-fin, ranked for economic impact. API verified live over https.
- **TSMC annual data lags a year** behind ASML's. Its FY2025 20-F is filed but the revenue series stops at 2024-12-31 — find out why.
- **20-F section parsing.** Foreign issuers number items differently, so TSMC and ASML currently get no language analysis at all.

- **Surface refresh failures somewhere Nicolas will see.** The staleness banner now warns on the page itself, but only once data is already stale. A failing workflow should reach him sooner than that.

## later
- **Personal finance tracker.** Deferred, not cancelled — in the original brief. When built: browser-local storage with an encrypted export, never committed to the repo, no bank credentials.
- **Full-text search across filings.** `efts.sec.gov` works and is fast — 308 10-Qs matched "agentic AI". Would let the watchlist be discovered rather than hand-maintained.
- **8-K coverage.** Currently indexed but not analysed; they carry the earnings releases that move the price.
- **Price targets** if the Finnhub tier is ever upgraded — free tier returns 403.
- **Sector/peer comparison** — margins and growth against a peer set rather than absolute.

## done
- Filings index, section extraction, sentence-level diff, XBRL financials, prices and filing reaction, analyst ratings, the desk UI, daily refresh workflow, Pages deploy.
