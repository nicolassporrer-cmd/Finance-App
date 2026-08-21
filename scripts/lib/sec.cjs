// Shared SEC EDGAR access layer.
//
// Two things here are not optional and cost a day to rediscover:
//
//   1. www.sec.gov returns 403 "Request Rate Threshold Exceeded" to any request
//      without a declared User-Agent. It is not rate limiting despite the wording
//      — the very first call fails. data.sec.gov is laxer, so a pipeline can look
//      half-working. The UA must be "AppName contact@email".
//   2. SEC's fair-access limit is 10 requests/second. We pace at 5/s; the extra
//      headroom costs nothing on a watchlist this size and avoids an IP ban that
//      takes 10 minutes to clear.
const fs = require('fs');
const path = require('path');

function loadEnv() {
  // Deliberately no dotenv dependency — this is six lines and one less thing to audit.
  const f = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const UA = process.env.SEC_USER_AGENT;
if (!UA || !/@/.test(UA)) {
  console.error(
    'SEC_USER_AGENT is missing or has no email address.\n' +
    'Expected form: "Nico-Finance-App you@example.com"\n' +
    'Set it in .env for local runs, or as a repo secret for Actions.'
  );
  process.exit(1);
}

const MIN_GAP_MS = 200;            // 5 req/s
let lastCall = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function paced() {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}

async function get(url, { retries = 3, asText = false } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    await paced();
    let res;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept-Encoding': 'gzip, deflate',
        },
      });
    } catch (err) {
      if (attempt === retries) throw new Error(`${url} — network error: ${err.message}`);
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      if (attempt === retries) throw new Error(`${url} — HTTP ${res.status} after ${retries} retries`);
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${url} — HTTP ${res.status}`);
    return asText ? res.text() : res.json();
  }
}

const getJSON = url => get(url);
const getText = url => get(url, { asText: true });

// CIK must be zero-padded to 10 digits for data.sec.gov, but bare for Archives URLs.
const padCik = cik => String(cik).replace(/\D/g, '').padStart(10, '0');
const bareCik = cik => String(Number(String(cik).replace(/\D/g, '')));

module.exports = { getJSON, getText, padCik, bareCik, UA };
