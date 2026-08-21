// Resolve the watchlist to SEC CIKs and pull each company's recent filings.
// Output: data/filings.json  — the index every later stage works from.
const fs = require('fs');
const path = require('path');
const { getJSON, padCik, bareCik } = require('./lib/sec.cjs');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

// Domestic issuers file 10-K/10-Q. Foreign private issuers (ASML, TSM) file
// 20-F/6-K instead and would otherwise silently produce an empty feed.
const FORMS = new Set(['10-K', '10-Q', '10-K/A', '10-Q/A', '8-K', '20-F', '6-K']);
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 500);

const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };

async function cikMap() {
  const cache = path.join(DATA, 'cik-map.json');
  // The full map is 218 KB and changes rarely; refetch weekly at most.
  if (fs.existsSync(cache)) {
    const ageDays = (Date.now() - fs.statSync(cache).mtimeMs) / 864e5;
    if (ageDays < 7) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  }
  console.log('Fetching SEC ticker->CIK map...');
  const raw = await getJSON('https://www.sec.gov/files/company_tickers.json');
  const map = {};
  for (const row of Object.values(raw)) map[row.ticker.toUpperCase()] = { cik: row.cik_str, name: row.title };
  fs.writeFileSync(cache, JSON.stringify(map, null, 2));
  console.log(`  ${Object.keys(map).length.toLocaleString()} tickers cached`);
  return map;
}

async function main() {
  const watchlist = JSON.parse(fs.readFileSync(path.join(DATA, 'watchlist.json'), 'utf8')).tickers;
  const map = await cikMap();
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString().slice(0, 10);
  const only = arg('--ticker');

  const companies = [];
  const unresolved = [];

  for (const entry of watchlist) {
    const t = entry.ticker.toUpperCase();
    if (only && t !== only.toUpperCase()) continue;
    const hit = map[t];
    if (!hit) { unresolved.push(t); continue; }

    const sub = await getJSON(`https://data.sec.gov/submissions/CIK${padCik(hit.cik)}.json`);
    const r = sub.filings.recent;
    const filings = [];

    for (let i = 0; i < r.form.length; i++) {
      if (!FORMS.has(r.form[i])) continue;
      if (r.filingDate[i] < cutoff) continue;
      const accNoDashes = r.accessionNumber[i].replace(/-/g, '');
      filings.push({
        form: r.form[i],
        filingDate: r.filingDate[i],
        reportDate: r.reportDate[i] || null,
        accession: r.accessionNumber[i],
        primaryDocument: r.primaryDocument[i],
        url: `https://www.sec.gov/Archives/edgar/data/${bareCik(hit.cik)}/${accNoDashes}/${r.primaryDocument[i]}`,
      });
    }
    filings.sort((a, b) => b.filingDate.localeCompare(a.filingDate));

    const byForm = {};
    for (const f of filings) byForm[f.form] = (byForm[f.form] || 0) + 1;

    companies.push({
      ticker: t,
      cik: padCik(hit.cik),
      name: sub.name,
      sic: sub.sicDescription || null,
      fiscalYearEnd: sub.fiscalYearEnd || null,
      note: entry.note || null,
      filings,
    });
    console.log(`  ${t.padEnd(6)} ${String(sub.name).slice(0, 28).padEnd(30)} ${filings.length} filings  ${JSON.stringify(byForm)}`);
  }

  if (unresolved.length) console.warn(`\n!! Unresolved tickers (not in SEC's map): ${unresolved.join(', ')}`);

  const out = {
    generatedAt: new Date().toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    cutoff,
    unresolved,
    companies,
  };
  fs.writeFileSync(path.join(DATA, 'filings.json'), JSON.stringify(out, null, 2));
  const total = companies.reduce((n, c) => n + c.filings.length, 0);
  console.log(`\nWrote data/filings.json — ${companies.length} companies, ${total} filings since ${cutoff}`);
}

main().catch(err => { console.error(err); process.exit(1); });
