// Locate the sections worth diffing inside an SEC filing.
//
// Three approaches were tried; the first two fail on real filings:
//
//   1. Flat "last match of Item N wins" — Item numbers are NOT unique. A 10-Q
//      has Item 2 twice (Part I = MD&A, Part II = Unregistered Sales), so this
//      silently resolves to Part II and loses MD&A while looking like a clean parse.
//   2. Split on PART boundaries first — defeated by running page headers.
//      MSFT's 10-K prints "PART I" 79 times, once per page, so last-wins places
//      the Part I boundary near the END of Part I and drops Items 1 and 1A.
//
//   3. What we do: match the section's TITLE, not its number or its Part.
//      Titles are stable across filers in a way numbering and layout are not.
//      ORCL writes "Item 1A Risk Factors" with no period; the title still matches.
//
// Every title also appears in the table of contents, so a title match alone is
// ambiguous. The discriminator is body length: a TOC entry is followed almost
// immediately by the next Item heading, while the real section runs for
// thousands of characters. We take the candidate that yields the longest body.

const ANY_ITEM = /(?:^|\n)\s*Item\s+\d{1,2}[A-Z]?\s*[.\-–—:]?/gi;

const P = String.raw`\s*[.\-–—:]?\s*`;   // optional punctuation between number and title

const SECTION_PATTERNS = {
  'Business':      new RegExp(String.raw`(?:^|\n)\s*Item\s+1${P}Business\b`, 'gi'),
  'Risk Factors':  new RegExp(String.raw`(?:^|\n)\s*Item\s+1A${P}Risk\s+Factors`, 'gi'),
  'MD&A':          new RegExp(String.raw`(?:^|\n)\s*Item\s+[27]${P}Management['’]?s\s+Discussion`, 'gi'),
};

// Which sections each form is expected to carry.
const BY_FORM = {
  '10-K':   ['Business', 'Risk Factors', 'MD&A'],
  '10-K/A': ['Business', 'Risk Factors', 'MD&A'],
  '10-Q':   ['Risk Factors', 'MD&A'],
  '10-Q/A': ['Risk Factors', 'MD&A'],
  // 20-F numbers its items differently (Risk Factors is Item 3.D) and is handled
  // separately; tracking it as a 10-K would silently mislabel sections.
  '20-F':   [],
};

function allMatches(text, re) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m.index);
  return out;
}

function findSections(text, form) {
  const wanted = BY_FORM[form] || [];
  if (!wanted.length) return {};

  const boundaries = allMatches(text, ANY_ITEM);
  const out = {};

  for (const label of wanted) {
    const candidates = allMatches(text, SECTION_PATTERNS[label]);
    let best = null;

    for (const start of candidates) {
      const next = boundaries.find(b => b > start + 20);
      const end = next === undefined ? text.length : next;
      const length = end - start;
      if (!best || length > best.length) best = { start, length, end };
    }

    // Under ~1500 chars every candidate was a table-of-contents line or a bare
    // cross-reference, which is a miss, not a section.
    if (best && best.length >= 1500) {
      out[label] = { start: best.start, length: best.length, text: text.slice(best.start, best.end).trim() };
    }
  }
  return out;
}

module.exports = { findSections, BY_FORM };
