// Analyst consensus from Finnhub: recommendation trends and price targets.
//
// This is the one pillar that cannot be done keylessly. Yahoo's quoteSummary
// endpoint used to serve it without credentials and now returns 401 "Invalid
// Crumb" — it needs a session cookie, which is fragile and against its terms.
// So: a free Finnhub key, read from FINNHUB_API_KEY (.env locally, repo secret
// in Actions).
//
// The script is deliberately non-fatal in three ways, because this data is a
// bonus and must never take the rest of the pipeline down with it:
//   - no key at all        -> writes an empty file and exits 0
//   - endpoint is premium  -> records the ticker as unavailable and continues
//   - a symbol is unknown  -> records it and continues
// Finnhub's free tier covers US listings; foreign issuers may return nothing.
const fs = require('fs');
const path = require('path');

// Loads .env if present, same as the SEC layer.
require('./lib/sec.cjs');

const DATA = path.join(__dirname, '..', 'data');
const KEY = process.env.FINNHUB_API_KEY;
const BASE = 'https://finnhub.io/api/v1';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(endpoint, symbol) {
  const url = `${BASE}${endpoint}?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(KEY)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (res.status === 403) return { premium: true };
  if (res.status === 429) { await sleep(2000); return call(endpoint, symbol); }
  if (!res.ok) return { error: `HTTP ${res.status}` };
  return { data: await res.json() };
}

function writeOut(payload) {
  fs.writeFileSync(path.join(DATA, 'consensus.json'), JSON.stringify(payload, null, 2));
}

async function main() {
  const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'filings.json'), 'utf8'));

  if (!KEY) {
    console.log('FINNHUB_API_KEY not set — skipping analyst consensus.');
    console.log('  Local runs: add it to .env   Actions: add it as a repo secret.');
    writeOut({ generatedAt: new Date().toISOString(), available: false,
               reason: 'FINNHUB_API_KEY not set', companies: [] });
    return;
  }

  const out = [];
  const problems = [];

  for (const co of idx.companies) {
    const rec = await call('/stock/recommendation', co.ticker);
    await sleep(1100);                       // free tier is 60 calls/minute
    const tgt = await call('/stock/price-target', co.ticker);
    await sleep(1100);

    const trends = Array.isArray(rec.data) ? rec.data : [];
    // Finnhub returns newest first; keep a year of monthly snapshots, oldest first.
    const history = trends.slice(0, 12).reverse().map(t => ({
      period: t.period,
      strongBuy: t.strongBuy || 0, buy: t.buy || 0, hold: t.hold || 0,
      sell: t.sell || 0, strongSell: t.strongSell || 0,
      total: (t.strongBuy || 0) + (t.buy || 0) + (t.hold || 0) + (t.sell || 0) + (t.strongSell || 0),
    }));

    const t = tgt.data && tgt.data.targetMean ? tgt.data : null;
    if (rec.premium || tgt.premium) problems.push({ ticker: co.ticker, issue: 'premium endpoint' });
    if (rec.error) problems.push({ ticker: co.ticker, issue: rec.error });
    if (!history.length && !t) problems.push({ ticker: co.ticker, issue: 'no coverage' });

    out.push({
      ticker: co.ticker,
      latest: history.length ? history[history.length - 1] : null,
      history,
      target: t ? {
        mean: t.targetMean, median: t.targetMedian,
        high: t.targetHigh, low: t.targetLow,
        lastUpdated: t.lastUpdated || null,
      } : null,
      targetUnavailable: !!tgt.premium,
    });

    const l = history.length ? history[history.length - 1] : null;
    console.log(`  ${co.ticker.padEnd(6)}` +
      (l ? `${String(l.total).padStart(3)} analysts  ${l.strongBuy}/${l.buy}/${l.hold}/${l.sell}/${l.strongSell}  (${l.period})`
         : '  no recommendation data') +
      (t ? `   target mean ${t.targetMean}` : tgt.premium ? '   target: premium' : '   target: —'));
  }

  writeOut({ generatedAt: new Date().toISOString(), available: true, problems, companies: out });
  console.log(`\nWrote data/consensus.json — ${out.filter(c => c.latest).length}/${out.length} with coverage`);
  for (const p of problems) console.log(`  ! ${p.ticker}: ${p.issue}`);
}

main().catch(err => { console.error(err); process.exit(1); });
