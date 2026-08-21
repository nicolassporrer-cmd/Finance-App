// Build a short business description for each company FROM ITS OWN 10-K.
//
// The point of this file is that nothing here is written by us. A plausible
// one-line summary of what a company does is trivially easy to generate and
// impossible for the reader to distinguish from a sourced one — which is exactly
// the failure mode this project exists to avoid. So every sentence shown is
// quoted from Item 1 "Business" of the company's most recent annual report, and
// carries the form, date and a link to the filing it came from.
//
// If no annual report can be parsed, the company gets no description at all
// rather than an invented one.
const fs = require('fs');
const path = require('path');
const { getText } = require('./lib/sec.cjs');
const { findSections } = require('./lib/sections.cjs');
const { htmlToText } = require('./lib/text.cjs');

const DATA = path.join(__dirname, '..', 'data');
const RAW = path.join(DATA, 'raw');

const ANNUAL = ['10-K', '10-K/A'];

function sentences(text) {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+(?=["“(]?[A-Z])/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// Filing prose is wrapped in navigation and legal furniture that reads as a
// sentence but says nothing about the business.
// The first alternative catches running page headers, which survive sentence
// splitting: "Apple Inc. | 2025 Form 10-K | 1 Services Advertising ...".
const NOISE = new RegExp([
  '\\|\\s*\\d{4}\\s*form\\s*10-k',
  'table of contents',
  'forward-looking',
  'incorporated by reference',
  'annual report on form',
  '^item\\s+\\d',
  '^part\\s+[ivx]+\\b',
  'securities and exchange commission',
  'this report contains',
  'unless the context',
  'refer to note',
  'our common stock is listed',
].join('|'), 'i');

function isProse(s) {
  if (s.length < 70 || s.length > 700) return false;
  if (NOISE.test(s)) return false;
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (!letters) return false;
  // Headings survive sentence splitting; they are mostly capitals.
  const caps = s.replace(/[^A-Z]/g, '').length / letters.length;
  if (caps > 0.35) return false;
  // Tables of figures also survive; they are mostly digits.
  if ((s.replace(/[^0-9]/g, '').length / s.length) > 0.25) return false;
  return /\b(we|our|the company|it|its)\b/i.test(s);
}

// "Revenue" appears constantly in a 10-K without describing how money is made.
// Requiring a verb of earning next to it is what separates "we generate revenue
// from subscriptions" from a heading that merely contains the word.
const REVENUE = /\b(generat|deriv|earn|recogni[sz])\w*\b[^.]{0,60}\b(revenue|revenues|sales|income|fees)\b|\b(revenue|revenues|net sales)\b[^.]{0,60}\b(from|derived|generated|consist|primarily|principally|comprise)\b/i;
const PRODUCT = /\b(we offer|we provide|we sell|we design|we manufactur|our products|our services|product portfolio|principal products|our brands|offerings include|portfolio (of|includes))\b/i;

// Sentences that actually say what the business is, rather than merely mentioning it.
const DESCRIBES = /\b(is|are)\s+(a|an|the|one of)\b|\b(designs?|develops?|manufactures?|produces?|provides?|offers?|operates?|sells?|markets?|delivers?|distributes?|serves?)\b/i;

// The section begins with its own heading and usually a subheading, which survive
// sentence splitting and get glued to the first real sentence:
// "Business Company Background The Company designs, manufactures..."
// Filings stack two or three of these before the first real sentence — "OUR
// COMPANY General Arch Capital is...", "Business Company Background The Company
// designs..." — so strip repeatedly until nothing more comes off.
// "the company" is deliberately NOT in this list. Adding it stripped the subject
// out of "The Company designs, manufactures and markets smartphones…", which then
// failed the prose test and vanished — Apple came out described by its iPhone
// sub-heading instead. Only strip words that are headings and never subjects.
const HEADING_WORDS = /^(item\s+\d+[a-z]?\.?\s*|business(\s+overview)?|overview|general|our\s+company|company\s+(background|overview|profile)|introduction|who\s+we\s+are)\b[\s:.,;—-]*/i;

function stripHeading(s) {
  let out = String(s).replace(/^[\s:.,;—-]+/, '');
  for (let i = 0; i < 5; i++) {
    const next = out.replace(HEADING_WORDS, '').replace(/^[A-Z][A-Za-z]*\s+(Overview|Background)\b[\s:.,;—-]*/, '');
    if (next === out) break;
    out = next.replace(/^[\s:.,;—-]+/, '');
  }
  return out.trim();
}

// Item 1 spends pages on staff, sustainability and regulation. All of it is prose
// about the company, none of it says what the business does.
// No closing \b: "employee\b" does not match "employees", which is how this list
// silently failed to filter a page of Abbott's human-resources prose.
const OFF_TOPIC = /\b(employee|workforce|human capital|diversity|inclusion|sustainab|charitab|philanthrop|communit|training|wellness|compensation and benefit|board of directors|governance)/i;
// Risk and outlook language reads like a revenue explanation without being one.
const SPECULATIVE = /\b(could|may|might|possible|potentially|risk|no assurance|if we (fail|are unable))\b/i;

// Sentences that point elsewhere, or describe the listing rather than the
// business. Each of these passed the "describes something" test and produced a
// useless opening line: Amazon's "Information on our net sales is contained in
// Item 8...", Starbucks' stock symbol, J&J's definition of its CODM.
const REFERENCE = new RegExp([
  'contained in item', 'set forth in item', 'included in item', 'see item', 'described in item',
  'our website', 'www\\.', 'investor relations',
  'chief operating decision maker', 'principal executive offices',
  'common stock (trades|is listed|began trading)', 'under the symbol',
  'nasdaq', 'new york stock exchange', 'annual meeting', 'fiscal year ended',
  'this (annual )?report', 'the accompanying', 'reportable segment',
].join('|'), 'i');

function profileFrom(text, companyName) {
  const sections = findSections(text, '10-K');
  const business = sections['Business'];
  if (!business) return null;

  // Strip the heading from the section TEXT, not from the first sentence: the
  // splitter cuts "Item 1." off as its own sentence, so the heading words end up
  // glued to the front of sentence two, where a first-sentence fix never reaches.
  let body = stripHeading(business.text.replace(/^\s*item\s+1\.?\s*/i, ''));
  const raw = sentences(body);
  for (let i = 0; i < Math.min(3, raw.length); i++) raw[i] = stripHeading(raw[i]);
  const all = raw.filter(isProse);
  if (!all.length) return null;

  // The first word of the company's name, for spotting self-description.
  const nameWord = String(companyName || '').split(/[\s,.]+/)[0] || '';
  const nameRe = nameWord.length > 3 ? new RegExp('\\b' + nameWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

  // A business description sits near the top of Item 1, so search a window rather
  // than the whole section — later sentences are segment detail and legal matter.
  const head = all.slice(0, 40);
  const scored = head.map((s, i) => {
    let score = 0;
    if (DESCRIBES.test(s)) score += 3;
    if (/\b(leading|global|largest|worldwide|provider of|operator of|marketplace|platform)\b/i.test(s)) score += 1;
    if (nameRe && nameRe.test(s)) score += 0.5;
    if (OFF_TOPIC.test(s)) score -= 5;
    if (REFERENCE.test(s)) score -= 6;
    if (/\b(fiscal year|52-|53-week|reorganiz|restructur|announced a change|moved from|combined with)\b/i.test(s)) score -= 4;
    // Position dominates. The description of the business is essentially always
    // the opening prose of Item 1; a later sentence naming the company outranked
    // it on content alone, which is how Apple came out as "Apple Vision Pro is
    // the Company's spatial computer" instead of what Apple actually does.
    score -= i * 0.3;
    return { s, score, i };
  }).sort((a, b) => b.score - a.score);

  let summary = scored.filter(x => x.score > 0.5).slice(0, 2)
    .sort((a, b) => a.i - b.i).map(x => stripHeading(x.s));

  // Fallback. The scoring above is opinionated enough to reject perfectly good
  // openings: Caterpillar's first sentence says "reorganized as Caterpillar Inc.",
  // which the reorganisation penalty killed, and Amazon opens on forward-looking
  // boilerplate. Rather than leave a major company blank, take the first sentence
  // that describes anything at all — still quoted, still from Item 1.
  if (!summary.length) {
    const first = head.find(s => DESCRIBES.test(s) && !OFF_TOPIC.test(s) && !REFERENCE.test(s));
    if (first) summary = [stripHeading(first)];
  }
  if (!summary.length) return null;

  const used = new Set(summary);
  const pick = (re, n) => all.filter(s => !used.has(s) && re.test(s) && !SPECULATIVE.test(s) && !OFF_TOPIC.test(s) && !REFERENCE.test(s)).slice(0, n)
    .map(s => { used.add(s); return s; });

  return {
    summary,
    revenueModel: pick(REVENUE, 2),
    products: pick(PRODUCT, 2),
    sectionChars: business.length,
  };
}

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'filings.json'), 'utf8'));
  const i = process.argv.indexOf('--ticker');
  const only = i > -1 ? process.argv[i + 1] : null;
  const limit = Number((process.argv.indexOf('--limit') > -1) ? process.argv[process.argv.indexOf('--limit') + 1] : 0);

  let targets = only ? idx.companies.filter(c => c.ticker === only.toUpperCase()) : idx.companies;
  if (limit) targets = targets.slice(0, limit);

  const out = [];
  const noAnnual = [];
  const noSection = [];
  let fetched = 0, done = 0;

  for (const co of targets) {
    const annual = (co.periodic || []).filter(f => ANNUAL.includes(f.form))
      .sort((a, b) => b.filingDate.localeCompare(a.filingDate))[0];
    if (!annual) { noAnnual.push(co.ticker); continue; }

    const cacheFile = path.join(RAW, `${co.ticker}-${annual.accession}.htm`);
    let html;
    try {
      if (fs.existsSync(cacheFile)) {
        html = fs.readFileSync(cacheFile, 'utf8');
      } else {
        html = await getText(annual.url);
        fetched += html.length;
        fs.writeFileSync(cacheFile, html);
      }
    } catch (err) {
      noSection.push(co.ticker);
      continue;
    }

    const p = profileFrom(htmlToText(html), co.name);
    if (!p) { noSection.push(co.ticker); continue; }

    out.push(Object.assign({
      ticker: co.ticker,
      source: { form: annual.form, date: annual.filingDate, url: annual.url },
    }, p));

    if (++done % 50 === 0) console.log(`  ${done}/${targets.length} profiled, ${Math.round(fetched / 1048576)} MB fetched`);
  }

  fs.writeFileSync(path.join(DATA, 'profiles.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), noAnnual, noSection, profiles: out }));

  console.log(`\nWrote data/profiles.json — ${out.length}/${targets.length} companies described`);
  console.log(`  ${(fs.statSync(path.join(DATA, 'profiles.json')).size / 1048576).toFixed(2)} MB`);
  if (noAnnual.length) console.log(`  ! no annual report in window (${noAnnual.length}): ${noAnnual.slice(0, 12).join(', ')}${noAnnual.length > 12 ? '…' : ''}`);
  if (noSection.length) console.log(`  ! Item 1 not parsed (${noSection.length}): ${noSection.slice(0, 12).join(', ')}${noSection.length > 12 ? '…' : ''}`);
  const withRev = out.filter(p => p.revenueModel.length).length;
  const withProd = out.filter(p => p.products.length).length;
  console.log(`  with a revenue-model sentence: ${withRev}   with a products sentence: ${withProd}`);
}

main().catch(err => { console.error(err); process.exit(1); });
