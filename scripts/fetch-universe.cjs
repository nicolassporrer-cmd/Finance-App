// Build the tracked universe: S&P 500 constituents, validated against SEC.
//
// The S&P 500 membership list is S&P's proprietary index — there is no
// authoritative free source for it. This uses a public community-maintained
// dataset and records its provenance and fetch date, so the list is auditable
// rather than pretending to be official.
//
// The CIK in that dataset is NOT trusted: it is cross-checked against SEC's own
// ticker map, which is authoritative. A wrong CIK silently pulls another
// company's financials, which looks completely normal on screen.
//
// Ticker punctuation differs between sources: S&P writes BRK.B, SEC writes BRK-B.
const fs = require('fs');
const path = require('path');
const { getJSON } = require('./lib/sec.cjs');

const DATA = path.join(__dirname, '..', 'data');
const SOURCE = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv';

// Minimal CSV reader: the file has quoted fields containing commas.
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const normalise = t => String(t).toUpperCase().trim().replace(/\./g, '-');

async function main() {
  const res = await fetch(SOURCE, { headers: { 'User-Agent': 'Finance-App' } });
  if (!res.ok) throw new Error(`constituents CSV — HTTP ${res.status}`);
  const rows = parseCSV(await res.text());
  const header = rows.shift().map(h => h.trim());
  const col = name => header.indexOf(name);

  const listed = rows.filter(r => r.length > 1 && r[col('Symbol')]).map(r => ({
    ticker: normalise(r[col('Symbol')]),
    rawTicker: r[col('Symbol')].trim(),
    name: (r[col('Security')] || '').trim(),
    sector: (r[col('GICS Sector')] || '').trim(),
    subIndustry: (r[col('GICS Sub-Industry')] || '').trim(),
    csvCik: (r[col('CIK')] || '').replace(/\D/g, ''),
  }));

  console.log(`constituents in source: ${listed.length}`);

  // SEC's own ticker -> CIK map is the authority.
  console.log('fetching SEC ticker map...');
  const raw = await getJSON('https://www.sec.gov/files/company_tickers.json');
  const secMap = {};
  for (const r of Object.values(raw)) secMap[normalise(r.ticker)] = { cik: String(r.cik_str), name: r.title };
  console.log(`  ${Object.keys(secMap).length.toLocaleString()} tickers in SEC map`);

  const companies = [], unresolved = [], mismatched = [];
  for (const c of listed) {
    const hit = secMap[c.ticker];
    if (!hit) { unresolved.push(c.ticker); continue; }
    const cikPadded = hit.cik.padStart(10, '0');
    if (c.csvCik && String(Number(c.csvCik)) !== String(Number(hit.cik))) {
      mismatched.push({ ticker: c.ticker, csv: c.csvCik, sec: hit.cik });
    }
    companies.push({
      ticker: c.ticker, rawTicker: c.rawTicker,
      name: hit.name || c.name, listName: c.name,
      sector: c.sector, subIndustry: c.subIndustry,
      cik: cikPadded,
    });
  }

  companies.sort((a, b) => a.ticker.localeCompare(b.ticker));
  fs.writeFileSync(path.join(DATA, 'universe.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: SOURCE,
    note: 'S&P 500 membership is proprietary; this list is community-maintained. CIKs are taken from SEC, not from the source CSV.',
    count: companies.length,
    unresolved, mismatched,
    companies,
  }, null, 2));

  console.log(`\nWrote data/universe.json — ${companies.length} companies`);
  const bySector = {};
  for (const c of companies) bySector[c.sector] = (bySector[c.sector] || 0) + 1;
  for (const [s, n] of Object.entries(bySector).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${s}`);
  if (unresolved.length) console.log(`\n! not in SEC ticker map (${unresolved.length}): ${unresolved.join(', ')}`);
  if (mismatched.length) {
    console.log(`\n! CIK disagreements, SEC wins (${mismatched.length}):`);
    for (const m of mismatched.slice(0, 10)) console.log(`   ${m.ticker}: csv ${m.csv} vs sec ${m.sec}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
