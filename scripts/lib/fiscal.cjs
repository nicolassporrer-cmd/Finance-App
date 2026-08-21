// Fiscal period labelling, derived from the period end date.
//
// XBRL's own `fy`/`fp` fields CANNOT be used for this. They describe the fiscal
// year of the FILING that reported the fact, not the period the fact covers — so
// once restatement handling keeps the most recently filed version, NVIDIA's
// periods ending 2024-01-28, 2025-01-26 and 2026-01-25 all carry fy2026. Labelling
// bars from that field prints the same year on three different years of data.
//
// Instead: months are counted from the company's own fiscal year end, taken from
// EDGAR's submissions feed (e.g. NVDA "0131" = 31 January).

// Quarter index within the fiscal year, and the fiscal year the period belongs to.
// A period ending in the fiscal-year-end month is the fourth quarter / full year.
function fiscalPeriod(endDate, fyEndMMDD) {
  const m = Number(String(fyEndMMDD || '1231').slice(0, 2)) || 12;
  const d = new Date(endDate + 'T00:00:00Z');
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();

  const monthsAfter = (month - m + 12) % 12;
  const quarter = monthsAfter === 0 ? 4 : Math.ceil(monthsAfter / 3);
  // If the period ends after the fiscal year end month, the fiscal year it belongs
  // to closes in the following calendar year.
  const fiscalYear = month > m ? year + 1 : year;
  return { quarter, fiscalYear };
}

const yy = y => String(y % 100).padStart(2, '0');

function quarterLabel(endDate, fyEndMMDD) {
  const p = fiscalPeriod(endDate, fyEndMMDD);
  return `Q${p.quarter}'${yy(p.fiscalYear)}`;
}

function annualLabel(endDate, fyEndMMDD) {
  const p = fiscalPeriod(endDate, fyEndMMDD);
  return `FY'${yy(p.fiscalYear)}`;
}

// Companies file no fourth-quarter 10-Q — Q4 appears only inside the annual
// figure — so a quarterly series taken straight from XBRL silently omits one
// quarter in four. Reconstruct it as full year minus the three filed quarters,
// and mark it derived so the UI can say so.
function deriveQ4(quarterly, annual, fyEndMMDD) {
  const byYear = new Map();
  for (const p of quarterly) {
    const f = fiscalPeriod(p.end, fyEndMMDD);
    if (!byYear.has(f.fiscalYear)) byYear.set(f.fiscalYear, []);
    byYear.get(f.fiscalYear).push(Object.assign({}, p, { quarter: f.quarter, fiscalYear: f.fiscalYear }));
  }

  const built = [];
  for (const a of annual) {
    const f = fiscalPeriod(a.end, fyEndMMDD);
    const qs = byYear.get(f.fiscalYear) || [];
    const first3 = qs.filter(q => q.quarter <= 3);
    if (first3.length !== 3) continue;                  // incomplete year, do not guess
    if (qs.some(q => q.quarter === 4)) continue;        // already present
    const sum = first3.reduce((n, q) => n + q.val, 0);
    built.push({
      start: first3[2].end, end: a.end, val: a.val - sum,
      quarter: 4, fiscalYear: f.fiscalYear, derived: true,
    });
  }
  return built;
}

module.exports = { fiscalPeriod, quarterLabel, annualLabel, deriveQ4 };
