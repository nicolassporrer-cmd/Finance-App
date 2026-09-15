# Build log

Append-only. Why the app is the way it is, so it can be rebuilt clean.

---

## 2026-08-21 — Filings desk built end to end

**Goal.** Track generative/agentic-AI research, corporate disclosure and market reaction, plus personal finances. Scoped down to the filings desk first; personal finance deferred by choice, research radar next.

**Shape.** Same pattern that worked for Movie-App: static site + GitHub Actions cron, data as committed JSON, no server, no cost. No framework — the page is one self-contained HTML file with the dataset inlined, so it cannot half-load.

**Every source was tested before being designed against**, which paid for itself immediately:
- Stooq, the obvious keyless price source, turned out to serve a JavaScript proof-of-work bot challenge. Replaced with Yahoo's chart endpoint.
- arXiv silently returns nothing over plain `http`; needs `https`.
- SEC returns 403 on the first call without a declared user agent.

**Four bugs that looked like clean successes.** Each produced plausible output and was caught only by asserting on the data:
1. Sections parsed without error but resolved Item 2 to Part II, dropping MD&A entirely — the one section the quarterly diff exists to compare.
2. EDGAR's per-letter kerning tags split words from the inside, so heading detection failed *and* every phrase count was silently wrong.
3. NVIDIA's revenue read $3.10B from 2020 because the tag fallback picked a legacy tag that stopped updating in 2022. Microsoft had the opposite polarity, so no fixed order could work.
4. Dynamics compared "four entries back" on a sparse series, landing four *years* back while the label read year-on-year.

**Design.** First pass looked like every generated dashboard — soft-shadowed cards, rounded corners, stat-tile strip, serif-over-sans, muted blue. Rejected. Three directions were drawn from the subject's own world (accounting paper, legal redline, trading tape) and the chosen answer is a *desk*: dark terminal board for scanning all companies, paper sheets for reading one. Chart palettes were validated for lightness, chroma, colourblind separation and contrast rather than eyeballed — the first ledger-appropriate palette failed protanopia separation at ΔE 3.2 and was rejected.

**Structure.** Board → pick a company → three sheets: financials, language, market. Earlier versions mixed companies across sections, which read as confusing and was.

**Honesty.** Derived values (EBITDA, FCF, reconstructed Q4) are labelled derived everywhere. Absent data renders an explicit dash naming why. The dynamics panel states measurements and explicitly is not a rating or recommendation.

**Known limits at time of writing:** analyst price targets are paid-tier only; consensus history is four months; TSMC and ASML file 20-F annually so have no quarterly figures; TSMC's annual data lags a year behind ASML's; page numbers still leak into extracted sentences.


---

## 2026-09-15 — Stale for 25 days; short-window returns added

**The app was not up to date, and nothing said so.** The daily refresh failed on every run from 2026-08-21 to 2026-09-15 — 25 consecutive failures — at the step that requires `SEC_USER_AGENT`. The secret was never added. The guard behaved exactly as designed: it failed loudly rather than publishing an empty dataset. But a loud failure nobody sees is a silent failure, and the site kept serving 21 August data while looking perfectly live.

Two fixes: a **data-age banner** keyed to the newest close in the set (not build time, which would cry wolf every weekend) — silent under 5 days, amber to 10, red beyond; and the whole pipeline re-run.

**Short-window returns.** Nicolas noticed the market was falling and the app did not show it. He was right about the move and wrong about where it was: the S&P was down only 1.28% on the week. The index is capitalisation-weighted, and META +7.9% and AAPL +4.1% were holding it up while the median company fell 1.93%, 371 of 503 declined, and 76 fell 5% or more. Cooper Companies fell 22%.

So the fix was not only a shorter window but **breadth** — the top bar now shows the index level beside how many companies rose and fell, the median move, and how many moved more than 5%. The two together say something neither says alone.

Mechanically: the two-year series is thinned to fortnightly to keep the page loadable, so a one-week move fits *inside a single step of it* and is undrawable. Short windows needed their own undecimated 30-session series. Returns count trading days, not calendar days, so "1 week" never lands on a weekend.
