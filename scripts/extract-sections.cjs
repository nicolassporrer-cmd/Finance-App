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

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'filings.json'), 'utf8'));
  const i = process.argv.indexOf('--ticker');
  const only = i > -1 ? process.argv[i + 1] : null;
  const limitPer = Number(process.env.MAX_PER_COMPANY || 6);

  const records = [];
  for (const co of idx.companies) {
    if (only && co.ticker !== only.toUpperCase()) continue;

    for (const f of co.filings.filter(x => PERIODIC.has(x.form)).slice(0, limitPer)) {
      const cacheFile = path.join(RAW, `${co.ticker}-${f.accession}.htm`);
      let html;
      if (fs.existsSync(cacheFile)) {
        html = fs.readFileSync(cacheFile, 'utf8');
      } else {
        html = await getText(f.url);
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

      const tr = wanted.map(k => `${k}:${sections[k] ? sections[k].length : 'MISSING'}`).join('  ');
      console.log(`  ${co.ticker.padEnd(6)} ${f.form.padEnd(6)} ${f.filingDate}  ${tr || '(no tracked sections for this form)'}`);
    }
  }

  records.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  fs.writeFileSync(path.join(DATA, 'language.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), terms: TERMS, records }, null, 2));

  const missing = records.filter(r => r.missingTracked.length);
  console.log(`\nWrote data/language.json — ${records.length} periodic reports`);
  console.log(`Fully parsed: ${records.length - missing.length} / ${records.length}`);
  for (const r of missing) console.log(`  ! ${r.ticker} ${r.form} ${r.filingDate} missing ${r.missingTracked.join(',')}`);
}

main().catch(err => { console.error(err); process.exit(1); });
