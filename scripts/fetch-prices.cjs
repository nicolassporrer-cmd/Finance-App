// Daily share prices from Yahoo's chart endpoint, plus the market's reaction to
// each filing.
//
// Source choice: Stooq was the obvious keyless option and is unusable — it serves
// a JavaScript proof-of-work bot challenge to non-browser clients. Alpha Vantage
// works but its free tier allows ~25 calls/day, which a 15-name watchlist blows
// through immediately. Yahoo's chart endpoint needs no key and returns daily bars.
// It is undocumented, so it is treated as fallible: failures are recorded per
// ticker rather than aborting the run.
//
// "Reaction" is measured from the LAST CLOSE BEFORE the filing to the first close
// after it. Filings are usually released outside market hours, so comparing the
// filing-day close to the previous close would attribute a full day of unrelated
// drift to the document.
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const RANGE = process.env.PRICE_RANGE || '2y';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function chart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
              `?range=${RANGE}&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const r = j.chart && j.chart.result && j.chart.result[0];
  if (!r) throw new Error(j.chart && j.chart.error ? JSON.stringify(j.chart.error) : 'no result');

  const ts = r.timestamp || [];
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const closes = q.close || [];
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] == null) continue;                      // holidays / halts come back null
    bars.push({ d: new Date(ts[i] * 1000).toISOString().slice(0, 10), c: Number(closes[i].toFixed(4)) });
  }
  return { currency: r.meta && r.meta.currency, exchange: r.meta && r.meta.exchangeName, bars };
}

const pctChange = (from, to) => from ? Number((((to - from) / from) * 100).toFixed(2)) : null;

// Short-window returns, counted in TRADING days off the end of the series — not
// calendar days, which would land on weekends and holidays and quietly compare
// against the wrong bar. Absent when the history is too short to reach back.
const WINDOWS = { d1: 1, w1: 5, m1: 21, m3: 63, m6: 126 };

function returns(bars) {
  const n = bars.length;
  if (!n) return {};
  const last = bars[n - 1].c;
  const out = {};
  for (const [k, back] of Object.entries(WINDOWS)) {
    out[k] = n > back ? pctChange(bars[n - 1 - back].c, last) : null;
  }
  // Year to date measures from the last close of the previous calendar year,
  // which is the first bar of this one minus one — using the first bar of the
  // year itself would omit the first day's move.
  const year = bars[n - 1].d.slice(0, 4);
  const firstIdx = bars.findIndex(b => b.d.slice(0, 4) === year);
  out.ytd = firstIdx > 0 ? pctChange(bars[firstIdx - 1].c, last) : null;
  return out;
}

function reaction(bars, filingDate) {
  const before = bars.filter(b => b.d < filingDate);
  const after = bars.filter(b => b.d >= filingDate);
  if (!before.length || !after.length) return null;

  const base = before[before.length - 1];
  const next = after[0];
  const day5 = after[Math.min(4, after.length - 1)];
  return {
    baseDate: base.d, baseClose: base.c,
    nextDate: next.d, nextClose: next.c,
    pct1d: pctChange(base.c, next.c),
    pct5d: after.length >= 5 ? pctChange(base.c, day5.c) : null,
  };
}

async function main() {
  const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'filings.json'), 'utf8'));
  const out = [];
  const failures = [];

  for (const co of idx.companies) {
    let data;
    try {
      data = await chart(co.ticker);
    } catch (err) {
      failures.push({ ticker: co.ticker, error: err.message });
      console.log(`  ${co.ticker.padEnd(6)} !! ${err.message}`);
      continue;
    }

    const periodic = (co.periodic || co.filings || []).filter(f => ['10-K', '10-Q', '20-F'].includes(f.form));
    const events = periodic.map(f => {
      const r = reaction(data.bars, f.filingDate);
      return r ? Object.assign({ form: f.form, filingDate: f.filingDate, accession: f.accession }, r) : null;
    }).filter(Boolean);

    const first = data.bars[0], last = data.bars[data.bars.length - 1];
    out.push({
      ticker: co.ticker, name: co.name,
      currency: data.currency, exchange: data.exchange,
      barCount: data.bars.length,
      first: first ? first.d : null, last: last ? last.d : null,
      lastClose: last ? last.c : null,
      rangePct: first && last ? pctChange(first.c, last.c) : null,
      returns: returns(data.bars),
      // Thinned to roughly weekly so the committed file stays small; the reaction
      // figures above are computed from the full daily series, not from this.
      series: data.bars.filter((_, i) => i % 5 === 0 || i === data.bars.length - 1),
      // The last 30 sessions at full daily resolution. A two-year series thinned
      // to weekly cannot show a one-week move at all — the whole move fits inside
      // a single step of it — so the short window needs its own undecimated data.
      recent: data.bars.slice(-30),
      events,
    });

    if (out.length % 50 === 0) console.log(`  ${out.length}/${idx.companies.length} priced, ${failures.length} failed`);

    await sleep(300);   // Yahoo is undocumented and unmetered; do not hammer it.
  }

  // Benchmarks, so a company's move can be read against the market rather than in
  // isolation. Without them a name down 3% looks alarming on a day the index fell 3%.
  const BENCH = { '^GSPC': 'S&P 500', '^IXIC': 'Nasdaq Composite', '^VIX': 'VIX' };
  const benchmarks = [];
  for (const [sym, label] of Object.entries(BENCH)) {
    try {
      const d = await chart(sym);
      const l = d.bars[d.bars.length - 1];
      benchmarks.push({ symbol: sym, label, last: l ? l.c : null, lastDate: l ? l.d : null,
        returns: returns(d.bars), recent: d.bars.slice(-30) });
      console.log(`  ${label.padEnd(18)} ${l ? l.c.toFixed(2) : '?'}  1w ${(returns(d.bars).w1)}%`);
    } catch (err) {
      failures.push({ ticker: sym, error: err.message });
    }
    await sleep(300);
  }

  fs.writeFileSync(path.join(DATA, 'prices.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), range: RANGE, failures, benchmarks, companies: out }));
  console.log(`\nWrote data/prices.json — ${out.length} tickers, ${failures.length} failed`);
}

main().catch(err => { console.error(err); process.exit(1); });
