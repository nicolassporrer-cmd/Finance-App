// Compare each tracked section against the same section in the previous filing
// of the same form. Output: data/diffs.json
//
// Naive set-difference is useless on MD&A, which restates the same sentences
// every quarter with new figures — nearly every sentence reads as both removed
// and added. So each sentence gets two keys: its exact text, and its text with
// all numbers blanked. A sentence whose blanked form survives is a RESTATEMENT
// (same language, new figures); only a sentence with no blanked match anywhere
// is genuinely NEW language. That distinction is the whole point of the feature.
const fs = require('fs');
const path = require('path');
const { findSections, BY_FORM } = require('./lib/sections.cjs');
const { htmlToText } = require('./lib/text.cjs');

const DATA = path.join(__dirname, '..', 'data');
const RAW = path.join(DATA, 'raw');

function sentences(text) {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+(?=["“(]?[A-Z])/)
    .map(s => s.trim())
    .filter(s => s.length > 40 && /[a-z]/.test(s));   // drop headings and table debris
}

const blankNumbers = s => s
  .replace(/[\d,.]*\d/g, '#')
  .replace(/\s+/g, ' ')
  .toLowerCase()
  .trim();

// Classify every sentence in the new filing against the old one:
//
//   unchanged  identical text
//   restated   identical once numbers are blanked  -> same language, new figures
//   modified   >=0.6 token overlap with some old sentence -> lightly reworded
//   added      nothing in the old filing resembles it -> genuinely new language
//
// The fuzzy tier is what makes this usable. Exact matching alone reports a
// sentence that gained a trailing clause as BOTH added and removed, which
// doubles every count and buries real new risks under near-duplicates.
const TOKEN_RE = /[a-z]+/g;
const tokensOf = s => new Set((blankNumbers(s).match(TOKEN_RE) || []));

function jaccard(a, b) {
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const t of small) if (big.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

const SIMILAR = 0.6;

function diffSections(oldText, newText) {
  const a = sentences(oldText), b = sentences(newText);
  const aExact = new Set(a);
  const aBlank = new Set(a.map(blankNumbers));
  const bExact = new Set(b);
  const bBlank = new Set(b.map(blankNumbers));
  const aTok = a.map(tokensOf), bTok = b.map(tokensOf);

  const added = [], modified = [], restated = [];
  const matchedOld = new Set();

  for (let i = 0; i < b.length; i++) {
    const s = b[i];
    if (aExact.has(s)) continue;
    if (aBlank.has(blankNumbers(s))) { restated.push(s); continue; }

    let bestJ = 0, bestIdx = -1;
    for (let j = 0; j < a.length; j++) {
      const r = bTok[i].size / (aTok[j].size || 1);
      if (r < 0.5 || r > 2) continue;                 // cheap length pre-filter
      const jc = jaccard(bTok[i], aTok[j]);
      if (jc > bestJ) { bestJ = jc; bestIdx = j; }
    }
    if (bestJ >= SIMILAR) { modified.push({ before: a[bestIdx], after: s, similarity: Number(bestJ.toFixed(2)) }); matchedOld.add(bestIdx); }
    else added.push(s);
  }

  const removed = [];
  for (let j = 0; j < a.length; j++) {
    if (matchedOld.has(j)) continue;
    const s = a[j];
    if (bExact.has(s) || bBlank.has(blankNumbers(s))) continue;
    let best = 0;
    for (let i = 0; i < b.length; i++) {
      const r = aTok[j].size / (bTok[i].size || 1);
      if (r < 0.5 || r > 2) continue;
      const jc = jaccard(aTok[j], bTok[i]);
      if (jc > best) best = jc;
    }
    if (best < SIMILAR) removed.push(s);
  }

  return {
    sentencesBefore: a.length, sentencesAfter: b.length,
    addedCount: added.length, removedCount: removed.length,
    modifiedCount: modified.length, restatedCount: restated.length,
    added: added.slice(0, 25), removed: removed.slice(0, 25), modified: modified.slice(0, 15),
  };
}

function loadSections(ticker, accession, form) {
  const p = path.join(RAW, `${ticker}-${accession}.htm`);
  if (!fs.existsSync(p)) return null;
  return findSections(htmlToText(fs.readFileSync(p, 'utf8')), form);
}

function main() {
  const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'filings.json'), 'utf8'));
  const out = [];

  for (const co of idx.companies) {
    // Compare like with like: a 10-Q against the previous 10-Q, never against a 10-K.
    for (const form of ['10-Q', '10-K', '20-F']) {
      if (!(BY_FORM[form] || []).length) continue;
      const seq = (co.periodic || co.filings || []).filter(f => f.form === form)
        .sort((a, b) => b.filingDate.localeCompare(a.filingDate));

      for (let i = 0; i + 1 < seq.length; i++) {
        const newer = seq[i], older = seq[i + 1];
        const sNew = loadSections(co.ticker, newer.accession, form);
        const sOld = loadSections(co.ticker, older.accession, form);
        if (!sNew || !sOld) continue;

        for (const label of BY_FORM[form]) {
          if (!sNew[label] || !sOld[label]) continue;
          const d = diffSections(sOld[label].text, sNew[label].text);
          out.push({
            ticker: co.ticker, name: co.name, form, section: label,
            from: { date: older.filingDate, accession: older.accession, url: older.url },
            to:   { date: newer.filingDate, accession: newer.accession, url: newer.url },
            ...d,
          });
        }
        if (i === 0) break;   // only the most recent transition per form, for now
      }
    }
  }

  out.sort((a, b) => b.to.date.localeCompare(a.to.date) || b.addedCount - a.addedCount);
  fs.writeFileSync(path.join(DATA, 'diffs.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), diffs: out }));

  console.log(`Wrote data/diffs.json — ${out.length} section comparisons\n`);
  let shown = 0;
  for (const d of out) {
    if (++shown > 12) break;
    console.log(`  ${d.ticker.padEnd(6)} ${d.form.padEnd(5)} ${d.section.padEnd(13)} ${d.from.date} -> ${d.to.date}   +${String(d.addedCount).padStart(3)} new  -${String(d.removedCount).padStart(3)} gone  ~${String(d.modifiedCount).padStart(3)} reworded  =${String(d.restatedCount).padStart(3)} refigured`);
  }
}

main();
