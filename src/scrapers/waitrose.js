// Waitrose UAE — server-rendered product tiles (no JSON API to harvest).
// We drive a real browser to each search page and read the product cards from
// the DOM: name, price ("AED x.xx each"), and the numeric id in the /products/
// URL. Query-driven so we only pull products relevant to our catalogue.

const { launch } = require('../lib/browser');
const { buildProduct } = require('./base');

const BASE = 'https://www.waitrose.ae';
const enc = encodeURIComponent;

// runs in the page: pull {id,name,price,href} for each product tile
function extractInPage() {
  const out = []; const seen = new Set();
  for (const a of document.querySelectorAll('a[href*="/products/"]')) {
    const href = a.getAttribute('href') || '';
    const m = href.match(/_(\d+)\/?$/);
    const id = m ? m[1] : href;
    if (seen.has(id)) continue;
    // climb to the nearest ancestor that also shows a price
    let node = a, card = null;
    for (let i = 0; i < 6 && node; i++) { node = node.parentElement; if (node && /AED\s*\d/.test(node.textContent)) { card = node; break; } }
    if (!card) continue;
    const t = card.innerText.replace(/\s+/g, ' ').trim();
    const pm = t.match(/AED\s*([\d,]+\.?\d*)/);
    if (!pm) continue;
    seen.add(id);
    out.push({ id, name: t.split(/AED/)[0].trim(), price: parseFloat(pm[1].replace(/,/g, '')), href });
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
        await page.goto(`${BASE}/en/search/?q=${enc(q)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        try { await page.waitForSelector('a[href*="/products/"]', { timeout: 8000 }); } catch {}
        await page.waitForTimeout(1200);
        const cards = await page.evaluate(extractInPage);
        let found = 0;
        for (const c of cards) {
          if (byId.has(c.id)) continue;
          byId.set(c.id, buildProduct({ ext_id: c.id, title: c.name, price: c.price, in_stock: true, url: BASE + c.href }));
          found++;
        }
        if (onProgress) onProgress({ slug: 'waitrose', i, q, total: queries.length, found, running: byId.size });
      } catch (e) {
        if (onProgress) onProgress({ slug: 'waitrose', i, q, total: queries.length, error: e.message });
      }
      await page.waitForTimeout(300 + Math.floor(Math.random() * 500));
    }
  } finally { await browser.close(); }
  return [...byId.values()];
}

module.exports = { slug: 'waitrose', scrape };
