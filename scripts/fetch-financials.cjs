// Pull structured financials from SEC XBRL company facts.
//
// This is the official tagged data behind every filing — no scraping, no key.
//
// Three traps, all of which silently produce plausible-looking wrong numbers:
//
//  1. PERIOD LENGTH. A 10-Q reports both the quarter AND the year-to-date figure,
//     both tagged form=10-Q fp=Q3. NVIDIA's Q3 FY2026 carries a 90-day value of
//     $57.0B and a 272-day value of $147.8B. Filtering on form alone mixes them
//     and inflates a quarter threefold. We filter on actual duration in days.
//
//  2. RESTATEMENTS. The same period is reported by several filings over time.
//     We keep the value from the most recently FILED document for each period.
//
//  3. TAG DRIFT. There is no single revenue tag. Companies use Revenues,
//     RevenueFromContractWithCustomerExcludingAssessedTax, or older variants,
//     and foreign issuers file IFRS instead of US-GAAP entirely. Each metric
//     therefore has an ordered fallback chain across both taxonomies.
//
// EBITDA and free cash flow are NOT reported tags — they are derived here, and
// flagged as derived so the UI can say so rather than implying SEC reported them.
const fs = require('fs');
const path = require('path');
const { getJSON, padCik } = require('./lib/sec.cjs');
const { quarterLabel, annualLabel, deriveQ4 } = require('./lib/fiscal.cjs');

const DATA = path.join(__dirname, '..', 'data');
const CACHE = path.join(DATA, 'raw-xbrl');

const METRICS = {
  revenue: {
    label: 'Revenue',
    'us-gaap': ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues',
                'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet'],
    'ifrs-full': ['Revenue', 'RevenueFromContractsWithCustomers'],
  },
  grossProfit: {
    label: 'Gross profit',
    'us-gaap': ['GrossProfit'],
    'ifrs-full': ['GrossProfit'],
  },
  operatingIncome: {
    label: 'Operating income',
    'us-gaap': ['OperatingIncomeLoss'],
    'ifrs-full': ['ProfitLossFromOperatingActivities'],
  },
  netIncome: {
    label: 'Net income',
    'us-gaap': ['NetIncomeLoss'],
    'ifrs-full': ['ProfitLoss'],
  },
  depreciationAmortisation: {
    label: 'D&A',
    'us-gaap': ['DepreciationDepletionAndAmortization', 'DepreciationAmortizationAndAccretionNet',
                'DepreciationAndAmortization'],
    'ifrs-full': ['DepreciationAndAmortisationExpense'],
  },
  // Most large filers never tag a combined D&A figure — Microsoft, Alphabet,
  // Broadcom, Oracle and TSMC all report the two components separately. Without
  // summing them there is no EBITDA at all for those companies, so these two
  // helper series exist purely to reconstruct it. Hidden from the output.
  _depreciation: {
    label: 'Depreciation',
    'us-gaap': ['Depreciation', 'DepreciationNonproduction'],
    'ifrs-full': ['DepreciationPropertyPlantAndEquipment'],
  },
  _amortisation: {
    label: 'Amortisation of intangibles',
    'us-gaap': ['AmortizationOfIntangibleAssets', 'AmortizationOfAcquiredIntangibleAssets'],
    'ifrs-full': ['AmortisationIntangibleAssetsOtherThanGoodwill'],
  },
  operatingCashFlow: {
    label: 'Operating cash flow',
    'us-gaap': ['NetCashProvidedByUsedInOperatingActivities',
                'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
    'ifrs-full': ['CashFlowsFromUsedInOperatingActivities'],
  },
  capex: {
    label: 'Capital expenditure',
    'us-gaap': ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
    'ifrs-full': ['PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities'],
  },
  researchDevelopment: {
    label: 'R&D',
    'us-gaap': ['ResearchAndDevelopmentExpense'],
    'ifrs-full': ['ResearchAndDevelopmentExpense'],
  },
};

const QUARTER = [80, 100];    // days
const ANNUAL  = [340, 380];

function rawSeries(bucket, tag, period) {
  const concept = bucket && bucket[tag];
  if (!concept || !concept.units) return null;
  // Currency unit varies (USD, TWD, EUR). Take whichever the filer used.
  const unitKey = Object.keys(concept.units).find(u => /^[A-Z]{3}$/.test(u));
  if (!unitKey) return null;

  const [lo, hi] = period === 'quarter' ? QUARTER : ANNUAL;
  const byPeriod = new Map();

  for (const p of concept.units[unitKey]) {
    if (!p.start || !p.end) continue;
    const days = Math.round((new Date(p.end) - new Date(p.start)) / 864e5);
    if (days < lo || days > hi) continue;
    if (!['10-Q', '10-K', '20-F'].includes(p.form)) continue;
    const key = p.start + '|' + p.end;
    const prev = byPeriod.get(key);
    // Restatement: keep whichever version was filed most recently.
    if (!prev || p.filed > prev.filed) byPeriod.set(key, p);
  }

  if (!byPeriod.size) return null;
  const points = [...byPeriod.values()]
    .sort((a, b) => a.end.localeCompare(b.end))
    .map(p => ({ start: p.start, end: p.end, val: p.val, form: p.form, fy: p.fy, fp: p.fp, filed: p.filed }));
  return { tag, unit: unitKey, points, latest: points[points.length - 1].end };
}

// Tag choice cannot be a fixed preference order. NVIDIA's live revenue sits in
// `Revenues` (current to 2026) while its `RevenueFromContract...` tag stopped in
// 2022; Microsoft is the exact reverse. Whichever order you hard-code returns
// years-stale figures for one of them — and stale figures look perfectly valid.
// So: evaluate every candidate and take the one reporting most recently.
function seriesFor(facts, metric, period) {
  const candidates = [];
  for (const taxonomy of ['us-gaap', 'ifrs-full']) {
    for (const tag of (METRICS[metric][taxonomy] || [])) {
      const s = rawSeries(facts[taxonomy], tag, period);
      if (s) candidates.push(Object.assign({ taxonomy }, s));
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.latest.localeCompare(a.latest) || b.points.length - a.points.length);
  return candidates[0];
}

// Sum two series period by period, keeping only periods present in both.
function sumSeries(a, b) {
  if (!a || !b) return null;
  const bBy = new Map(b.points.map(p => [p.end, p.val]));
  const points = a.points.filter(p => bBy.has(p.end))
    .map(p => ({ start: p.start, end: p.end, val: p.val + bBy.get(p.end), form: p.form, fy: p.fy, fp: p.fp }));
  if (!points.length) return null;
  return { tag: a.tag + ' + ' + b.tag, taxonomy: a.taxonomy, unit: a.unit, points, latest: points[points.length - 1].end };
}

// Year-over-year against the same period one year earlier, matched on end date
// within a tolerance — fiscal calendars shift by a few days each year.
function withGrowth(points) {
  return points.map(p => {
    const target = new Date(p.end); target.setFullYear(target.getFullYear() - 1);
    let match = null, bestGap = Infinity;
    for (const q of points) {
      const gap = Math.abs(new Date(q.end) - target) / 864e5;
      if (gap < bestGap && gap <= 20) { bestGap = gap; match = q; }
    }
    const yoy = match && match.val !== 0 ? (p.val - match.val) / Math.abs(match.val) : null;
    return { ...p, yoy: yoy === null ? null : Number(yoy.toFixed(4)) };
  });
}

async function factsFor(ticker, cik) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, `${ticker}.json`);
  if (fs.existsSync(f) && (Date.now() - fs.statSync(f).mtimeMs) / 864e5 < 1) {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  const data = await getJSON(`https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`);
  fs.writeFileSync(f, JSON.stringify(data));
  return data;
}

async function main() {
  const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'filings.json'), 'utf8'));
  const out = [];

  for (const co of idx.companies) {
    let facts;
    try {
      facts = (await factsFor(co.ticker, co.cik)).facts;
    } catch (err) {
      console.log(`  ${co.ticker.padEnd(6)} !! ${err.message}`);
      continue;
    }

    const record = { ticker: co.ticker, name: co.name, metrics: {}, derived: {}, missing: [] };

    const series = {};
    for (const key of Object.keys(METRICS)) {
      series[key] = { quarter: seriesFor(facts, key, 'quarter'), annual: seriesFor(facts, key, 'annual') };
    }

    // Reconstruct D&A from its components where the combined tag is absent.
    for (const period of ['quarter', 'annual']) {
      if (!series.depreciationAmortisation[period]) {
        const built = sumSeries(series._depreciation[period], series._amortisation[period]);
        if (built) { series.depreciationAmortisation[period] = built; record.derivedDA = true; }
      }
    }

    const fyEnd = co.fiscalYearEnd;

    for (const key of Object.keys(METRICS)) {
      if (key.startsWith('_')) continue;          // helper series, not reported
      const q = series[key].quarter, a = series[key].annual;
      if (!q && !a) { record.missing.push(key); continue; }

      // Fill in the Q4 that no 10-Q ever reports, then re-sort and re-derive
      // growth so year-over-year is computed against a complete series.
      let qPoints = q ? q.points.slice() : [];
      if (q && a) {
        const q4 = deriveQ4(qPoints, a.points, fyEnd);
        if (q4.length) qPoints = qPoints.concat(q4).sort((x, y) => x.end.localeCompare(y.end));
      }

      record.metrics[key] = {
        label: METRICS[key].label,
        tag: (q || a).tag, taxonomy: (q || a).taxonomy, unit: (q || a).unit,
        quarterly: withGrowth(qPoints).slice(-13)
          .map(p => Object.assign({}, p, { label: quarterLabel(p.end, fyEnd) })),
        annual: a ? withGrowth(a.points).slice(-5)
          .map(p => Object.assign({}, p, { label: annualLabel(p.end, fyEnd) })) : [],
      };
    }

    // Derived, non-GAAP. Labelled so the UI never implies SEC reported these.
    for (const period of ['quarterly', 'annual']) {
      const op = record.metrics.operatingIncome && record.metrics.operatingIncome[period] || [];
      const da = record.metrics.depreciationAmortisation && record.metrics.depreciationAmortisation[period] || [];
      const ocf = record.metrics.operatingCashFlow && record.metrics.operatingCashFlow[period] || [];
      const cap = record.metrics.capex && record.metrics.capex[period] || [];

      const daBy = new Map(da.map(p => [p.end, p.val]));
      const capBy = new Map(cap.map(p => [p.end, p.val]));

      const stamp = p => Object.assign({}, p, {
        label: period === 'quarterly' ? quarterLabel(p.end, fyEnd) : annualLabel(p.end, fyEnd),
      });

      record.derived['ebitda_' + period] = withGrowth(op
        .filter(p => daBy.has(p.end))
        .map(p => ({ start: p.start, end: p.end, val: p.val + daBy.get(p.end), form: p.form }))).map(stamp);

      record.derived['fcf_' + period] = withGrowth(ocf
        .filter(p => capBy.has(p.end))
        .map(p => ({ start: p.start, end: p.end, val: p.val - capBy.get(p.end), form: p.form }))).map(stamp);
    }

    out.push(record);

    const rev = record.metrics.revenue;
    const latest = rev && rev.quarterly.length ? rev.quarterly[rev.quarterly.length - 1] : null;
    console.log(`  ${co.ticker.padEnd(6)} ${String(rev ? rev.tag : 'NO REVENUE TAG').slice(0, 46).padEnd(48)}` +
      (latest ? `${latest.end}  ${(latest.val / 1e9).toFixed(2)}B ${rev.unit}  yoy ${latest.yoy === null ? '—' : (latest.yoy * 100).toFixed(1) + '%'}` : '(no quarterly points)') +
      (record.missing.length ? `  missing:${record.missing.length}` : ''));
  }

  fs.writeFileSync(path.join(DATA, 'financials.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), companies: out }, null, 2));
  console.log(`\nWrote data/financials.json — ${out.length} companies`);
  const gaps = out.filter(r => r.missing.length);
  for (const g of gaps) console.log(`  ! ${g.ticker} missing: ${g.missing.join(', ')}`);
}

main().catch(err => { console.error(err); process.exit(1); });
