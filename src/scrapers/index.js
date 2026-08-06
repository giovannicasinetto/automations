// Registry of all competitor scrapers. Each exports { slug, scrape(opts) }.
//
// - dolcesalato: pure fetch of Shopify products.json (full catalog, no queries)
// - spinneys / waitrose / carrefour / grandiose: query-driven via a real
//   browser (search each keyword, harvest the site's own JSON responses)
// - viva: no first-party online catalog (sells via Talabat/noon) -> disabled
//
// The search URL + JSON matcher for each site are best-effort defaults derived
// from recon. If a site changes, adjust `searchUrl` / `jsonMatch` here only.

const dolcesalato = require('./dolcesalato');
const waitrose = require('./waitrose');
const spinneys = require('./spinneys');
const { makeSearchScraper } = require('./search-scraper');

const enc = encodeURIComponent;

const carrefour = makeSearchScraper({
  slug: 'carrefour',
  baseUrl: 'https://www.carrefouruae.com',
  searchUrl: (q) => `https://www.carrefouruae.com/mafuae/en/search?keyword=${enc(q)}`,
  // Carrefour's Next.js app hits its own /api/v1/search/... endpoints.
  jsonMatch: (url) => /\/api\/v\d\/search\/listing/i.test(url),
  waitFor: '[data-testid*="product"], [class*="ProductCard"]',
});

const grandiose = makeSearchScraper({
  slug: 'grandiose',
  baseUrl: 'https://www.grandiose.ae',
  searchUrl: (q) => `https://www.grandiose.ae/catalogsearch/result/?q=${enc(q)}`,
  // Magento: prices are rendered in HTML, but many themes also fetch JSON.
  // If nothing is harvested, see grandiose-html.js for an HTML fallback.
  jsonMatch: (url) => /graphql|\/rest\/|price|search/i.test(url),
  waitFor: '.product-item, [data-price-amount], .price',
});

// Viva: no scrapable first-party catalog. Kept as a no-op so the pipeline
// still lists it and reports 0 coverage rather than crashing.
const viva = {
  slug: 'viva',
  async scrape() { return []; },
  note: 'No first-party online catalog; sells via Talabat/noon marketplaces.',
};

const ALL = { dolcesalato, spinneys, waitrose, carrefour, grandiose, viva };

module.exports = { ALL, get: (slug) => ALL[slug] };
