// Spinneys — server-rendered product tiles (same storefront platform Spinneys
// runs for Waitrose UAE). Products at /en-ae/catalogue/{slug}_{id}/. The card
// text is "<price> each <unitprice> per <unit> <NAME> <qty>" (or "<price> / Per
// Kg <NAME> <qty>"), so price is a prefix and the name trails it.

const { launch } = require('../lib/browser');
const { buildProduct } = require('./base');

const BASE = 'https://www.spinneys.com';
const enc = encodeURIComponent;

function extractInPage() {
  const out = []; const seen = new Set();
  for (const a of document.querySelectorAll('a[href*="/catalogue/"]')) {
    const href = a.getAttribute('href') || '';
    if (href.includes('/category/')) continue;
    const m = href.match(/_(\d+)\/?$/);
    if (!m || seen.has(m[1])) continue;
    let node = a, card = null;
    for (let i = 0; i < 6 && node; i++) { node = node.parentElement; if (node && /\d+\.\d{2}/.test(node.textContent)) { card = node; break; } }
    if (!card) continue;
    const t = card.innerText.replace(/\s+/g, ' ').trim();
    const pm = t.match(/([\d,]+\.\d{2})/);
    if (!pm) continue;
    const price = parseFloat(pm[1].replace(/,/g, ''));
    const name = t
      .replace(/^[\d.,]+\s*(each|\/?\s*per\s*\w+)?\s*/i, '')  // leading price + "each" / "per kg" / "/ Per Kg"
      .replace(/^!?\s*[\d.,]+\s*per\s*[\w%]+\s*/i, '')        // secondary "! 17.00 per 100g"
      .replace(/\s*\d+\s*$/, '')                              // trailing quantity stepper
      .trim();
    if (!name) continue;
    seen.add(m[1]);
    out.push({ id: m[1], name, price, href });
  }
  return out;
}

async function scrape({ queries = [], onProgress } = {}) {
  const { browser, ctx } = await launch();
  const page = await ctx.newPage();
  const byId = new Map();
  try {
    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      try {
        await page.goto(`${BASE}/en-ae/search/?q=${enc(q)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        try { await page.waitForSelector('a[href*="/catalogue/"]', { timeout: 8000 }); } catch {}
        await page.waitForTimeout(1400);
        const cards = await page.evaluate(extractInPage);
        let found = 0;
        for (const c of cards) {
          if (byId.has(c.id)) continue;
          byId.set(c.id, buildProduct({ ext_id: c.id, title: c.name, price: c.price, in_stock: true, url: BASE + c.href }));
          found++;
        }
        if (onProgress) onProgress({ slug: 'spinneys', i, q, total: queries.length, found, running: byId.size });
      } catch (e) {
        if (onProgress) onProgress({ slug: 'spinneys', i, q, total: queries.length, error: e.message });
      }
      await page.waitForTimeout(300 + Math.floor(Math.random() * 500));
    }
  } finally { await browser.close(); }
  return [...byId.values()];
}

module.exports = { slug: 'spinneys', scrape };
