// Generic query-driven scraper for JS/anti-bot sites. For each search keyword
// it opens the site's own search results page in a real browser and harvests
// the JSON the page fetches, then extracts products defensively. This one
// factory backs Spinneys, Waitrose, Carrefour and Grandiose — only the URL
// patterns differ (see scrapers/index.js).

const { launch, harvestJson } = require('../lib/browser');
const { extractProducts } = require('./base');

function makeSearchScraper({ slug, searchUrl, jsonMatch, baseUrl, waitFor, maxPerQuery = 40 }) {
  async function scrape({ queries = [], onProgress } = {}) {
    const { browser, ctx } = await launch();
    const page = await ctx.newPage();
    const byKey = new Map();  // dedupe across queries

    try {
      for (let i = 0; i < queries.length; i++) {
        const q = queries[i];
        try {
          const blobs = await harvestJson(
            page,
            (url) => jsonMatch(url, q),
            async () => {
              await page.goto(searchUrl(q), { waitUntil: 'domcontentloaded', timeout: 30000 });
              if (waitFor) { try { await page.waitForSelector(waitFor, { timeout: 8000 }); } catch {} }
              await page.waitForTimeout(2500);
            },
            { timeoutMs: 25000 }
          );

          let found = 0;
          for (const blob of blobs) {
            for (const p of extractProducts(blob, { baseUrl })) {
              if (!p.price || !p.title) continue;
              const key = p.ext_id ? `id:${p.ext_id}` : `t:${p.norm_name}|${p.price}`;
              if (byKey.has(key)) continue;
              byKey.set(key, p);
              if (++found >= maxPerQuery) break;
            }
          }
          if (onProgress) onProgress({ slug, i, q, total: queries.length, found, running: byKey.size });
        } catch (e) {
          if (onProgress) onProgress({ slug, i, q, total: queries.length, error: e.message });
        }
        await page.waitForTimeout(400 + Math.floor(Math.random() * 600)); // be polite
      }
    } finally {
      await browser.close();
    }
    return [...byKey.values()];
  }
  return { slug, scrape };
}

module.exports = { makeSearchScraper };
