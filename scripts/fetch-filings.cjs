// Pull each tracked company's recent filings from EDGAR.
// Output: data/filings.json — the index every later stage works from.
//
// At S&P 500 scale the shape matters: keeping every 8-K for 503 companies is
// ~12,500 entries and several megabytes of committed JSON, for data nothing
// downstream reads. Only periodic reports are kept in full; other forms are
// reduced to a count plus the most recent date, which is all the freshness
// marker needs.
const fs = require('fs');
const path = require('path');
const { getJSON, padCik, bareCik } = require('./lib/sec.cjs');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

// Domestic issuers file 10-K/10-Q. Foreign private issuers file 20-F/6-K instead
// and would otherwise produce a silently empty feed.
const PERIODIC = new Set(['10-K', '10-Q', '10-K/A', '10-Q/A', '20-F', '20-F/A']);
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 900);
const KEEP_PERIODIC = Number(process.env.KEEP_PERIODIC || 8);

const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };

function universe() {
  const f = path.join(DATA, 'universe.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')).companies;
  const w = JSON.parse(fs.readFileSync(path.join(DATA, 'watchlist.json'), 'utf8')).tickers;
  return w.map(x => ({ ticker: x.ticker.toUpperCase(), note: x.note }));
}

async function main() {
  const list = universe();
  const only = arg('--ticker');
  const limit = Number(arg('--limit') || 0);
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString().slice(0, 10);

  let targets = only ? list.filter(c => c.ticker === only.toUpperCase()) : list;
  if (limit) targets = targets.slice(0, limit);

  const companies = [];
  const failed = [];
  let done = 0;

  for (const entry of targets) {
    let sub;
    try {
      sub = await getJSON(`https://data.sec.gov/submissions/CIK${padCik(entry.cik)}.json`);
    } catch (err) {
      failed.push({ ticker: entry.ticker, error: err.message });
      continue;
    }

    const r = sub.filings.recent;
    const periodic = [];
    const counts = {};
    let latest = null;

    for (let i = 0; i < r.form.length; i++) {
      const form = r.form[i], date = r.filingDate[i];
      if (date < cutoff) continue;
      counts[form] = (counts[form] || 0) + 1;
      if (!latest || date > latest.date) latest = { form, date };
      if (!PERIODIC.has(form)) continue;
      periodic.push({
        form, filingDate: date,
        reportDate: r.reportDate[i] || null,
        accession: r.accessionNumber[i],
        primaryDocument: r.primaryDocument[i],
        url: `https://www.sec.gov/Archives/edgar/data/${bareCik(entry.cik)}/${r.accessionNumber[i].replace(/-/g, '')}/${r.primaryDocument[i]}`,
      });
    }
    periodic.sort((a, b) => b.filingDate.localeCompare(a.filingDate));

    companies.push({
      ticker: entry.ticker,
      cik: padCik(entry.cik),
      name: sub.name,
      sector: entry.sector || null,
      subIndustry: entry.subIndustry || null,
      sic: sub.sicDescription || null,
      fiscalYearEnd: sub.fiscalYearEnd || null,
      note: entry.note || null,
      latestFiling: latest,
      latestPeriodic: periodic[0] ? { form: periodic[0].form, date: periodic[0].filingDate } : null,
      filingCounts: counts,
      periodic: periodic.slice(0, KEEP_PERIODIC),
    });

    if (++done % 50 === 0) console.log(`  ${done}/${targets.length} indexed...`);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    lookbackDays: LOOKBACK_DAYS, cutoff,
    count: companies.length,
    failed,
    companies,
  };
  fs.writeFileSync(path.join(DATA, 'filings.json'), JSON.stringify(out));

  const totalPeriodic = companies.reduce((n, c) => n + c.periodic.length, 0);
  const noPeriodic = companies.filter(c => !c.periodic.length);
  console.log(`\nWrote data/filings.json — ${companies.length} companies, ${totalPeriodic} periodic reports since ${cutoff}`);
  console.log(`  file size: ${(fs.statSync(path.join(DATA, 'filings.json')).size / 1048576).toFixed(2)} MB`);
  if (noPeriodic.length) console.log(`  ! ${noPeriodic.length} with no periodic report in window: ${noPeriodic.slice(0, 10).map(c => c.ticker).join(', ')}${noPeriodic.length > 10 ? '…' : ''}`);
  if (failed.length) console.log(`  ! ${failed.length} failed: ${failed.slice(0, 10).map(f => f.ticker).join(', ')}`);
}

main().catch(err => { console.error(err); process.exit(1); });
