// HTML -> plain text for SEC filings.
//
// The trap: EDGAR filings wrap individual LETTERS in their own <span>/<font>
// tags for kerning. Replacing every tag with a space therefore splits words from
// the inside — MSFT's heading becomes "RIS K FACTORS" and ORCL's "R isk Factors".
// That breaks heading detection, and worse, silently corrupts every phrase count:
// "data center" becomes "data cente r" and simply stops matching.
//
// So separators are chosen per tag: block elements and table cells become
// whitespace, inline elements are removed with no separator at all.
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li|table|section)\s*>/gi, '\n')
    .replace(/<\/(td|th)\s*>/gi, ' ')
    // Everything left is inline (span, font, b, i, a, sup...) — no separator.
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8217;|&rsquo;|&#39;|&apos;/gi, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&quot;/gi, '"')
    .replace(/&#8212;|&mdash;/gi, '—')
    .replace(/&#8211;|&ndash;/gi, '–')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
module.exports = { htmlToText };
