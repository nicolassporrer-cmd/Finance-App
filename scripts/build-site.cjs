// Build the deployable site: site/template.html + data/mock-payload.json -> dist/index.html
//
// The page is one self-contained HTML file with the dataset inlined, so there is
// no bundler, no dependencies and nothing to fetch at runtime. That also means the
// site cannot half-load: either the data is in the file or the build failed.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');

const template = fs.readFileSync(path.join(ROOT, 'site', 'template.html'), 'utf8');
const payload = fs.readFileSync(path.join(ROOT, 'data', 'mock-payload.json'), 'utf8');

if (template.indexOf('__PAYLOAD__') === -1) {
  console.error('site/template.html has no __PAYLOAD__ placeholder.');
  process.exit(1);
}

// A literal </script> anywhere in the JSON would close the tag early and break the
// page silently — the markup stays valid, the data just vanishes.
const safe = payload.split('</').join('<\\/');

// Function replacement, not a string: `$&` and friends inside the JSON would
// otherwise be interpreted as replacement patterns and corrupt the data.
const html = template.replace('__PAYLOAD__', () => safe);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// .nojekyll stops GitHub Pages running the output through Jekyll, which would
// strip files beginning with an underscore.
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const parsed = JSON.parse(payload);
const openTags = (html.match(/<script/g) || []).length;
const closeTags = (html.match(/<\/script>/g) || []).length;
if (openTags !== closeTags) {
  console.error(`Unbalanced script tags: ${openTags} open, ${closeTags} close.`);
  process.exit(1);
}

console.log(`dist/index.html — ${(html.length / 1024).toFixed(0)} KB`);
console.log(`  companies:     ${parsed.companies.length}`);
console.log(`  filings:       ${parsed.totals.filings}`);
console.log(`  comparisons:   ${parsed.totals.comparisons}`);
console.log(`  consensus:     ${parsed.consensusAvailable ? 'present' : 'absent (' + (parsed.consensusReason || 'unknown') + ')'}`);
