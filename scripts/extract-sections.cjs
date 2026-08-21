// Download each periodic report, convert to text, locate the sections worth
// diffing, and measure AI-related language document-wide and per section.
//
// Raw HTML is cached under data/raw/ (gitignored). Caching the HTML rather than
// the converted text matters: the text conversion has been wrong twice, and each
// fix would otherwise mean re-downloading every filing.
const fs = require('fs');
const path = require('path');
const { getText } = require('./lib/sec.cjs');
const { findSections, BY_FORM } = require('./lib/sections.cjs');
const { htmlToText } = require('./lib/text.cjs');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const RAW = path.join(DATA, 'raw');

const PERIODIC = new Set(['10-K', '10-Q', '20-F', '10-K/A', '10-Q/A']);

// "AI" alone is excluded: case-folded it collides with ordinary words.
const TERMS = [
  'artificial intelligence', 'generative ai', 'agentic', 'ai agent',
  'machine learning', 'large language model', 'foundation model',
  'reasoning model', 'neural network', 'inference', 'training',
  'data center', 'gpu', 'accelerator', 'accelerated computing',
  'export control', 'capital expenditure', 'compute capacity',
  'copilot', 'chatbot', 'hallucinat',
];

// Filers differ on spelling: MSFT writes "datacenter", NVDA "data center".
// Without normalising, MSFT scores 0 on a term it uses constantly.
function normalise(lower) {
  return lower
    .replace(/datacent(er|re)/g, 'data center')
    .replace(/co-pilot/g, 'copilot')
    .replace(/\ba\.i\.\b/g, 'ai');
}

function termCounts(raw) {
  const lower = normalise(raw.toLowerCase());
  const out = {};
  for (const t of TERMS) {
    const n = lower.split(t).length - 1;
    if (n) out[t] = n;
  }
  return out;
}

// At 500 companies, fetching six filings each is ~3.5 GB for data that only ever
// feeds one comparison. Pair mode takes the two most recent filings of whichever
// form the company most recently filed — exactly what one diff needs, and no more.
function selectFilings(co, limitPer) {
  const periodic = (co.periodic || co.filings || []).filter(x => PERIODIC.has(x.form));
  if (!process.env.PAIR_MODE) return periodic.slice(0, limitPer);
  if (!periodic.length) return [];
  const form = periodic[0].form;
  return periodic.filter(f => f.form === form).slice(0, 2);
}

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'filings.json'), 'utf8'));
  const i = process.argv.indexOf('--ticker');
  const only = i > -1 ? process.argv[i + 1] : null;
  const limitPer = Number(process.env.MAX_PER_COMPANY || 6);

  const records = [];
  let fetched = 0;
  for (const co of idx.companies) {
    if (only && co.ticker !== only.toUpperCase()) continue;

    for (const f of selectFilings(co, limitPer)) {
      const cacheFile = path.join(RAW, `${co.ticker}-${f.accession}.htm`);
      let html;
      if (fs.existsSync(cacheFile)) {
        html = fs.readFileSync(cacheFile, 'utf8');
      } else {
        html = await getText(f.url);
        fetched += html.length;
        fs.writeFileSync(cacheFile, html);
      }

      const text = htmlToText(html);
      const sections = findSections(text, f.form);
      const wanted = BY_FORM[f.form] || [];

      const sectionStats = {};
      for (const [label, meta] of Object.entries(sections)) {
        sectionStats[label] = { chars: meta.length, terms: termCounts(meta.text) };
      }

      records.push({
        ticker: co.ticker, name: co.name, form: f.form,
        filingDate: f.filingDate, reportDate: f.reportDate,
        accession: f.accession, url: f.url,
        words: text.split(/\s+/).length,
        chars: text.length,
        sections: sectionStats,
        tracked: wanted.filter(k => sections[k]),
        missingTracked: wanted.filter(k => !sections[k]),
        terms: termCounts(text),
      });

      if (records.length % 100 === 0) {
        console.log(`  ${records.length} documents processed, ${Math.round(fetched / 1048576)} MB fetched`);
      }
    }
  }

  records.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  // No pretty-printing at this scale — indentation roughly triples the file.
  fs.writeFileSync(path.join(DATA, 'language.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), terms: TERMS, records }));

  const missing = records.filter(r => r.missingTracked.length);
  console.log(`\nWrote data/language.json — ${records.length} periodic reports, ` +
    `${(fs.statSync(path.join(DATA, 'language.json')).size / 1048576).toFixed(2)} MB`);
  console.log(`Fully parsed: ${records.length - missing.length} / ${records.length}`);
  const byForm = {};
  for (const r of missing) for (const k of r.missingTracked) byForm[r.form + ' ' + k] = (byForm[r.form + ' ' + k] || 0) + 1;
  for (const [k, n] of Object.entries(byForm).sort((a, b) => b[1] - a[1])) console.log(`  ! ${n} missing ${k}`);
}

main().catch(err => { console.error(err); process.exit(1); });
