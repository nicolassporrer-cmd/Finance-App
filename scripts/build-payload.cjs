// Assemble the single JSON the page reads.
// Every value traces to a fetch stage. Nothing is invented; absent stays absent.
//
// At 500 companies size is the constraint. The page inlines this file, so each
// company costs roughly 10 KB and the whole set has to stay loadable. Series are
// therefore trimmed here, once, rather than in the page: price history is thinned
// to fortnightly, quarterly series capped at 13 periods, and diff excerpts to a
// handful of sentences. GitHub Pages serves the result gzipped.
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const read = (f, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); }
  catch (e) { return fallback; }
};

const idx = read('filings.json');
const fin = read('financials.json', { companies: [] });
const px = read('prices.json', { companies: [], range: '2y', failures: [] });
const diffs = read('diffs.json', { diffs: [] }).diffs;
const lang = read('language.json', { records: [], terms: [] });
const consensus = read('consensus.json', { available: false, companies: [] });
const profiles = read('profiles.json', { profiles: [] });

const clip = (s, n) => {
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;
};

const B = v => {
  if (v === null || v === undefined) return '—';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  return a >= 1e9 ? s + (a / 1e9).toFixed(1) + 'B' : a >= 1e6 ? s + (a / 1e6).toFixed(0) + 'M' : s + a.toFixed(0);
};

function ratio(numer, denom) {
  if (!numer || !denom) return [];
  const d = new Map(denom.map(p => [p.end, p.val]));
  return numer.filter(p => d.has(p.end) && d.get(p.end))
    .map(p => ({ end: p.end, label: p.label, pct: Number(((p.val / d.get(p.end)) * 100).toFixed(1)) }));
}

const last = a => (a && a.length ? a[a.length - 1] : null);

// The comparison must be the same period ONE YEAR EARLIER, matched on date.
// Counting entries back is wrong on sparse series — it silently compares across
// four years while the label still reads year-on-year.
function yearAgo(series, point) {
  if (!series || !point) return null;
  const target = new Date(point.end + 'T00:00:00Z');
  target.setUTCFullYear(target.getUTCFullYear() - 1);
  let best = null, bestGap = Infinity;
  for (const p of series) {
    const gap = Math.abs(new Date(p.end + 'T00:00:00Z') - target) / 864e5;
    if (gap < bestGap && gap <= 25) { bestGap = gap; best = p; }
  }
  return best;
}

const trim = p => p && ({ end: p.end, label: p.label, val: p.val,
  yoy: p.yoy === undefined ? null : p.yoy, derived: p.derived ? 1 : undefined });

const finBy = new Map(fin.companies.map(c => [c.ticker, c]));
const pxBy = new Map(px.companies.map(c => [c.ticker, c]));
const consBy = new Map((consensus.companies || []).map(c => [c.ticker, c]));
const profBy = new Map((profiles.profiles || []).map(p => [p.ticker, p]));
const diffBy = new Map();
for (const d of diffs) {
  if (!diffBy.has(d.ticker)) diffBy.set(d.ticker, []);
  diffBy.get(d.ticker).push(d);
}
const langBy = new Map();
for (const r of lang.records) {
  const prev = langBy.get(r.ticker);
  if (!prev || r.filingDate > prev.filingDate) langBy.set(r.ticker, r);
}

const companies = idx.companies.map(co => {
  const f = finBy.get(co.ticker) || { metrics: {}, derived: {}, missing: [] };
  const p = pxBy.get(co.ticker) || null;
  const m = f.metrics || {};
  const get = (k, period) => (m[k] && m[k][period]) || [];

  const revQ = get('revenue', 'quarterly');
  const revA = get('revenue', 'annual');
  const ebitdaQ = (f.derived && f.derived.ebitda_quarterly) || [];
  const ebitdaA = (f.derived && f.derived.ebitda_annual) || [];
  const fcfQ = (f.derived && f.derived.fcf_quarterly) || [];
  const fcfA = (f.derived && f.derived.fcf_annual) || [];
  const niQ = get('netIncome', 'quarterly');
  const ebitdaMarginQ = ratio(ebitdaQ, revQ);

  const quarterly = revQ.length > 0;
  const rev = last(revQ) || last(revA);
  const emNow = last(ebitdaMarginQ), emThen = yearAgo(ebitdaMarginQ, emNow);
  const fNow = last(fcfQ) || last(fcfA), fThen = yearAgo(fcfQ.length ? fcfQ : fcfA, fNow);
  const cons = consBy.get(co.ticker) || null;
  const myDiffs = diffBy.get(co.ticker) || [];

  const dyn = [];
  if (rev && rev.yoy !== null && rev.yoy !== undefined) {
    const prevYear = yearAgo(revQ, rev);
    const prior = prevYear && prevYear.yoy !== null ? prevYear.yoy : null;
    dyn.push({ k: 'Revenue growth', v: (rev.yoy * 100).toFixed(1) + '%',
      note: prior === null ? 'year over year' :
        (rev.yoy > prior ? 'accelerating from ' : 'slowing from ') + (prior * 100).toFixed(1) + '%',
      trend: prior === null ? 0 : (rev.yoy > prior ? 1 : -1) });
  }
  if (emNow) {
    dyn.push({ k: 'EBITDA margin', v: emNow.pct.toFixed(1) + '%',
      note: emThen ? (emNow.pct > emThen.pct ? 'up from ' : 'down from ') + emThen.pct.toFixed(1) + '% in ' + emThen.label
                   : 'derived; no year-earlier period filed',
      trend: emThen ? (emNow.pct > emThen.pct ? 1 : -1) : 0 });
  }
  if (fNow) {
    dyn.push({ k: 'Free cash flow', v: fNow.val, money: 1,
      note: fThen ? (fNow.val > fThen.val ? 'up from ' : 'down from ') + B(fThen.val) + ' in ' + fThen.label
                  : 'operating cash flow − capex; no year-earlier period filed',
      trend: fThen ? (fNow.val > fThen.val ? 1 : -1) : 0 });
  }
  if (p && p.rangePct !== null && p.rangePct !== undefined) {
    dyn.push({ k: 'Share price', v: (p.rangePct > 0 ? '+' : '') + p.rangePct.toFixed(1) + '%',
      note: 'over ' + px.range, trend: p.rangePct > 0 ? 1 : -1 });
  }
  if (cons && cons.latest && cons.latest.total) {
    const l = cons.latest;
    const posNow = (l.strongBuy + l.buy) / l.total;
    const first = cons.history && cons.history.length > 1 ? cons.history[0] : null;
    const posThen = first && first.total ? (first.strongBuy + first.buy) / first.total : null;
    dyn.push({ k: 'Analyst ratings', v: (posNow * 100).toFixed(0) + '% positive',
      note: posThen === null ? l.total + ' analysts'
        : l.total + ' analysts, ' + (posNow > posThen ? 'up from ' : posNow < posThen ? 'down from ' : 'flat at ') +
          (posThen * 100).toFixed(0) + '% in ' + first.period.slice(0, 7),
      trend: posThen === null ? 0 : (posNow > posThen ? 1 : (posNow < posThen ? -1 : 0)) });
  }
  const riskAdded = myDiffs.filter(d => d.section === 'Risk Factors').reduce((n, d) => n + d.addedCount, 0);
  if (myDiffs.length) {
    dyn.push({ k: 'New risk language', v: riskAdded ? '+' + riskAdded + ' sentences' : 'none',
      note: 'vs. previous filing of the same form', trend: 0 });
  }

  // Fortnightly, not weekly: at 500 companies the price series is the single
  // largest contributor to page weight and the shape survives the thinning.
  const series = p ? p.series.filter((_, i) => i % 2 === 0 || i === p.series.length - 1) : [];

  return {
    ticker: co.ticker, cik: co.cik, name: co.name, sector: co.sector, subIndustry: co.subIndustry,
    unit: (m.revenue && m.revenue.unit) || null,
    cadence: quarterly ? 'quarterly' : (revA.length ? 'annual only' : 'none'),
    revenueTag: (m.revenue && m.revenue.tag) || null,
    derivedDA: f.derivedDA ? 1 : undefined,
    derivedRevenue: f.derivedRevenue ? 1 : undefined,
    thinHistory: revQ.length && revQ.length < 4 ? 1 : undefined,
    missing: (f.missing || []).length ? f.missing : undefined,

    revenueQ: revQ.slice(-13).map(trim), revenueA: revA.slice(-5).map(trim),
    ebitdaQ: ebitdaQ.slice(-13).map(trim), ebitdaA: ebitdaA.slice(-5).map(trim),
    fcfQ: fcfQ.slice(-13).map(trim), fcfA: fcfA.slice(-5).map(trim),
    netIncomeQ: niQ.slice(-13).map(trim),
    grossMarginQ: ratio(get('grossProfit', 'quarterly'), revQ).slice(-13),
    operatingMarginQ: ratio(get('operatingIncome', 'quarterly'), revQ).slice(-13),
    ebitdaMarginQ: ebitdaMarginQ.slice(-13),

    headline: {
      revenue: trim(rev), revenuePeriod: quarterly ? 'quarter' : 'year',
      ebitda: trim(last(ebitdaQ) || last(ebitdaA)),
      fcf: trim(fNow),
      netIncome: trim(last(niQ) || last(get('netIncome', 'annual'))),
    },
    dynamics: dyn,

    price: p ? { currency: p.currency, exchange: p.exchange, lastClose: p.lastClose,
      last: p.last, rangePct: p.rangePct, series, events: p.events.slice(0, 8) } : null,

    consensus: cons && cons.latest ? { latest: cons.latest, history: cons.history,
      target: cons.target || null, targetUnavailable: cons.targetUnavailable } : null,

    diffs: myDiffs.map(d => ({
      form: d.form, section: d.section, from: d.from.date, to: d.to.date, url: d.to.url,
      added: d.addedCount, removed: d.removedCount, reworded: d.modifiedCount, refigured: d.restatedCount,
      before: d.sentencesBefore, after: d.sentencesAfter,
      newLines: d.added.slice(0, 4).map(s => clip(s, 300)),
      goneLines: d.removed.slice(0, 2).map(s => clip(s, 220)),
    })),

    latestLanguage: (function () {
      const r = langBy.get(co.ticker);
      return r ? { form: r.form, date: r.filingDate, words: r.words, terms: r.terms } : null;
    })(),

    profile: profBy.get(co.ticker) || null,
    latestFiling: co.latestFiling,
    latestPeriodic: co.latestPeriodic,
    filingCount: Object.values(co.filingCounts || {}).reduce((a, b) => a + b, 0),
  };
});

const withRevenue = companies.filter(c => c.headline.revenue);
const payload = {
  generatedAt: new Date().toISOString(),
  cutoff: idx.cutoff,
  priceRange: px.range,
  universe: 'S&P 500',
  consensusAvailable: !!consensus.available,
  totals: {
    companies: companies.length,
    withFinancials: withRevenue.length,
    withPrices: companies.filter(c => c.price).length,
    withConsensus: companies.filter(c => c.consensus).length,
    withDiffs: companies.filter(c => c.diffs.length).length,
    withProfiles: companies.filter(c => c.profile).length,
    allForms: idx.companies.reduce((n, c) => n + (Object.values(c.filingCounts || {}).reduce((a, b) => a + b, 0)), 0),
    periodicIndexed: idx.companies.reduce((n, c) => n + c.periodic.length, 0),
    thinHistory: companies.filter(c => c.thinHistory).length,
    periodic: lang.records.length,
    comparisons: diffs.length,
    priceEvents: px.companies.reduce((n, c) => n + c.events.length, 0),
  },
  companies,
};

const out = path.join(DATA, 'payload.json');
fs.writeFileSync(out, JSON.stringify(payload));
const mb = fs.statSync(out).size / 1048576;
console.log(`data/payload.json — ${mb.toFixed(2)} MB`);
console.log(`  companies:       ${payload.totals.companies}`);
console.log(`  with financials: ${payload.totals.withFinancials}`);
console.log(`  with prices:     ${payload.totals.withPrices}`);
console.log(`  with consensus:  ${payload.totals.withConsensus}`);
console.log(`  with diffs:      ${payload.totals.withDiffs}`);
console.log(`  per company:     ${(mb * 1024 / Math.max(1, companies.length)).toFixed(1)} KB`);
