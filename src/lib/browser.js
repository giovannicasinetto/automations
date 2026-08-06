// Shared Playwright browser helper. Anti-bot sites (Carrefour/Akamai, Algolia
// front-ends) are far easier to scrape by driving a real browser and reading
// the JSON the site itself requests than by reverse-engineering tokens.
//
// Requires: npm i playwright  &&  npx playwright install chromium
let chromium;
try { ({ chromium } = require('playwright')); } catch { /* optional until installed */ }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function launch() {
  if (!chromium) throw new Error('playwright not installed. Run: npm i playwright && npx playwright install chromium');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: 'en-AE',
    viewport: { width: 1366, height: 900 },
    geolocation: { latitude: 25.2048, longitude: 55.2708 }, // Dubai
    permissions: ['geolocation'],
  });
  return { browser, ctx };
}

// Collect JSON responses whose URL matches `predicate` while `action` runs.
// Returns an array of parsed bodies.
async function harvestJson(page, predicate, action, { timeoutMs = 20000 } = {}) {
  const bodies = [];
  const handler = async (resp) => {
    try {
      const url = resp.url();
      if (!predicate(url)) return;
      const ct = (resp.headers()['content-type'] || '');
      if (!ct.includes('json')) return;
      bodies.push(await resp.json());
    } catch { /* ignore non-JSON / aborted */ }
  };
  page.on('response', handler);
  try { await action(); } finally {
    await page.waitForTimeout(1500);
    page.off('response', handler);
  }
  return bodies;
}

module.exports = { launch, harvestJson, UA };
