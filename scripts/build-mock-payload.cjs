// Assemble the single JSON payload the mock page reads.
// Every value traces to filings.json / financials.json / prices.json / diffs.json
// / language.json. Nothing is invented; absent stays absent.
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const read = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const idx = read('filings.json');
const fin = read('financials.json');
const px = read('prices.json');
const diffs = read('diffs.json').diffs;
const lang = read('language.json');

// Consensus is optional — it needs a Finnhub key. Absent is a normal state, not
// an error, and the UI renders an explicit empty panel rather than nothing.
let consensus = { available: false, companies: [] };
try { consensus = read('consensus.json'); } catch (e) { /* not fetched yet */ }

const clip = (s, n) => {
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;
};

// Margin series: align two metrics on period end date.
function ratio(numer, denom) {
  if (!numer || !denom) return [];
  const d = new Map(denom.map(p => [p.end, p.val]));
  return numer.filter(p => d.has(p.end) && d.get(p.end))
    .map(p => ({ end: p.end, label: p.label, pct: Number(((p.val / d.get(p.end)) * 100).toFixed(1)) }));
}

const B = v => { if(v===null||v===undefined) return "—"; var a=Math.abs(v),s=v<0?"-":""; return a>=1e9? s+(a/1e9).toFixed(1)+"B" : a>=1e6? s+(a/1e6).toFixed(0)+"M" : s+a.toFixed(0); };
const last = a => (a && a.length ? a[a.length - 1] : null);

// The comparison point must be the same period ONE YEAR EARLIER, matched on date.
// Counting four entries back is wrong whenever a series is sparse: NVIDIA's free
// cash flow series has gaps, so "four back" landed on Q2'22 while the label still
// implied a year-on-year move. Absent means absent — no nearest-available fallback.
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
const trim = p => p && ({ end: p.end, label: p.label, val: p.val, yoy: p.yoy === undefined ? null : p.yoy, derived: !!p.derived });

const companies = idx.companies.map(co => {
  const f = fin.companies.find(x => x.ticker === co.ticker) || { metrics: {}, derived: {}, missing: [] };
  const p = px.companies.find(x => x.ticker === co.ticker) || null;
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
  const revPrevYear = yearAgo(revQ, rev);

  // Dynamics: measured directions only. These are observations, never advice —
  // each is a comparison between two filed figures, with the comparison stated.
  const dyn = [];
  if (rev && rev.yoy !== null) {
    const prior = revPrevYear && revPrevYear.yoy !== null ? revPrevYear.yoy : null;
    dyn.push({
      k: 'Revenue growth',
      v: (rev.yoy * 100).toFixed(1) + '%',
      dir: rev.yoy > 0 ? 1 : -1,
      note: prior === null ? 'year over year' :
        (rev.yoy > prior ? 'accelerating from ' : 'slowing from ') + (prior * 100).toFixed(1) + '%',
      trend: prior === null ? 0 : (rev.yoy > prior ? 1 : -1),
    });
  }
  const emNow = last(ebitdaMarginQ), emThen = yearAgo(ebitdaMarginQ, emNow);
  if (emNow) {
    dyn.push({
      k: 'EBITDA margin', v: emNow.pct.toFixed(1) + '%',
      dir: emThen ? (emNow.pct > emThen.pct ? 1 : -1) : 0,
      note: emThen ? (emNow.pct > emThen.pct ? 'up from ' : 'down from ') + emThen.pct.toFixed(1) + '% in ' + emThen.label : 'derived; no year-earlier period filed',
      trend: emThen ? (emNow.pct > emThen.pct ? 1 : -1) : 0,
    });
  }
  const fNow = last(fcfQ) || last(fcfA), fThen = yearAgo(fcfQ.length ? fcfQ : fcfA, fNow);
  if (fNow) {
    dyn.push({
      k: 'Free cash flow', v: fNow.val,
      money: true,
      dir: fNow.val > 0 ? 1 : -1,
      note: fThen ? (fNow.val > fThen.val ? 'up from ' : 'down from ') + B(fThen.val) + ' in ' + fThen.label : 'operating cash flow − capex; no year-earlier period filed',
      trend: fThen ? (fNow.val > fThen.val ? 1 : -1) : 0,
    });
  }
  if (p && p.rangePct !== null) {
    dyn.push({ k: 'Share price', v: (p.rangePct > 0 ? '+' : '') + p.rangePct.toFixed(1) + '%',
      dir: p.rangePct > 0 ? 1 : -1, note: 'over ' + px.range, trend: p.rangePct > 0 ? 1 : -1 });
  }
  const cons = (consensus.companies || []).find(x => x.ticker === co.ticker) || null;
  if (cons && cons.latest && cons.latest.total) {
    const l = cons.latest;
    const posNow = (l.strongBuy + l.buy) / l.total;
    const first = cons.history && cons.history.length > 1 ? cons.history[0] : null;
    const posThen = first && first.total ? (first.strongBuy + first.buy) / first.total : null;
    dyn.push({
      k: 'Analyst ratings',
      v: (posNow * 100).toFixed(0) + '% positive',
      dir: posNow > 0.6 ? 1 : (posNow < 0.4 ? -1 : 0),
      note: (posThen === null
        ? l.total + ' analysts'
        : l.total + ' analysts, ' + (posNow > posThen ? 'up from ' : posNow < posThen ? 'down from ' : 'flat at ') +
          (posThen * 100).toFixed(0) + '% in ' + cons.history[0].period.slice(0, 7)),
      trend: posThen === null ? 0 : (posNow > posThen ? 1 : (posNow < posThen ? -1 : 0)),
    });
  }

  const myDiffs = diffs.filter(d => d.ticker === co.ticker);
  const riskAdded = myDiffs.filter(d => d.section === 'Risk Factors').reduce((n, d) => n + d.addedCount, 0);
  if (myDiffs.length) {
    dyn.push({ k: 'New risk language', v: riskAdded ? '+' + riskAdded + ' sentences' : 'none',
      dir: riskAdded > 20 ? -1 : 0, note: 'vs. previous filing of the same form', trend: 0 });
  }

  return {
    ticker: co.ticker, name: co.name, note: co.note, sic: co.sic,
    unit: (m.revenue && m.revenue.unit) || null,
    fiscalYearEnd: co.fiscalYearEnd,
    cadence: quarterly ? 'quarterly' : (revA.length ? 'annual only' : 'none'),
    revenueTag: (m.revenue && m.revenue.tag) || null,
    derivedDA: !!f.derivedDA,
    missing: f.missing || [],

    revenueQ: revQ.map(trim), revenueA: revA.map(trim),
    ebitdaQ: ebitdaQ.map(trim), ebitdaA: ebitdaA.map(trim),
    fcfQ: fcfQ.map(trim), fcfA: fcfA.map(trim),
    netIncomeQ: niQ.map(trim),
    rndQ: get('researchDevelopment', 'quarterly').map(trim),
    capexQ: get('capex', 'quarterly').map(trim),
    ocfQ: get('operatingCashFlow', 'quarterly').map(trim),

    grossMarginQ: ratio(get('grossProfit', 'quarterly'), revQ),
    operatingMarginQ: ratio(get('operatingIncome', 'quarterly'), revQ),
    ebitdaMarginQ: ebitdaMarginQ,

    headline: {
      revenue: trim(rev), revenuePeriod: quarterly ? 'quarter' : 'year',
      ebitda: trim(last(ebitdaQ) || last(ebitdaA)),
      fcf: trim(fNow),
      netIncome: trim(last(niQ) || last(get('netIncome', 'annual'))),
    },
    dynamics: dyn,

    price: p ? {
      currency: p.currency, exchange: p.exchange, lastClose: p.lastClose,
      last: p.last, rangePct: p.rangePct, series: p.series, events: p.events,
    } : null,

    diffs: myDiffs.map(d => ({
      form: d.form, section: d.section, from: d.from.date, to: d.to.date, url: d.to.url,
      added: d.addedCount, removed: d.removedCount, reworded: d.modifiedCount, refigured: d.restatedCount,
      before: d.sentencesBefore, after: d.sentencesAfter,
      newLines: d.added.slice(0, 6).map(s => clip(s, 320)),
      goneLines: d.removed.slice(0, 4).map(s => clip(s, 240)),
      rewordedLines: d.modified.slice(0, 2).map(x => ({ sim: x.similarity, before: clip(x.before, 210), after: clip(x.after, 210) })),
    })),

    latestLanguage: (function () {
      const rs = lang.records.filter(r => r.ticker === co.ticker);
      if (!rs.length) return null;
      const r = rs.reduce((a, b) => (a.filingDate > b.filingDate ? a : b));
      return { form: r.form, date: r.filingDate, words: r.words, terms: r.terms };
    })(),

    filingCount: co.filings.length,
    latestFiling: co.filings[0] ? { form: co.filings[0].form, date: co.filings[0].filingDate } : null,
    // Most recent periodic report is a separate thing from the most recent filing
    // of any kind — an 8-K is usually the latest, but it is not a report.
    latestPeriodic: (function () {
      const p = co.filings.find(f => ['10-K', '10-Q', '20-F'].includes(f.form));
      return p ? { form: p.form, date: p.filingDate } : null;
    })(),
    consensus: (consensus.companies || []).find(x => x.ticker === co.ticker) || null,
  };
});

const payload = {
  generatedAt: new Date().toISOString(),
  cutoff: idx.cutoff,
  priceRange: px.range,
  terms: lang.terms,
  consensusAvailable: !!consensus.available,
  consensusReason: consensus.reason || null,
  totals: {
    companies: companies.length,
    filings: idx.companies.reduce((n, c) => n + c.filings.length, 0),
    periodic: lang.records.length,
    parsed: lang.records.filter(r => !r.missingTracked.length).length,
    comparisons: diffs.length,
    priceEvents: px.companies.reduce((n, c) => n + c.events.length, 0),
  },
  companies,
};

fs.writeFileSync(path.join(DATA, 'mock-payload.json'), JSON.stringify(payload));
console.log('payload bytes:', fs.statSync(path.join(DATA, 'mock-payload.json')).size.toLocaleString());
console.log('quarterly financials:', companies.filter(c => c.revenueQ.length).length + '/' + companies.length);
console.log('with prices:', companies.filter(c => c.price).length);
console.log('with dynamics rows:', companies.filter(c => c.dynamics.length >= 4).length);
console.log('sample labels (NVDA):', (companies.find(c => c.ticker === 'NVDA') || {}).revenueQ.map(p => p.label).join(' '));
