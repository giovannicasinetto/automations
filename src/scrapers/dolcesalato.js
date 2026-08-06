// Dolce & Salato — Shopify. The storefront exposes /products.json openly, so
// we pull the full catalog once (no per-query searching needed). Verified:
// 247 products, one page. This is the reference "easy" adapter.

const { buildProduct } = require('./base');

const BASE = 'https://dolcesalato.ae';

async function scrape() {
  const products = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${BASE}/products.json?limit=250&page=${page}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    });
    if (!res.ok) break;
    const { products: batch } = await res.json();
    if (!batch || batch.length === 0) break;

    for (const p of batch) {
      // Shopify: one product can have several variants (sizes) — each is a
      // sellable line with its own price/barcode, so emit one per variant.
      const variants = p.variants && p.variants.length ? p.variants : [{}];
      for (const v of variants) {
        const title = v.title && v.title !== 'Default Title'
          ? `${p.title} ${v.title}` : p.title;
        products.push(buildProduct({
          ext_id: v.id || p.id,
          title,
          brand: p.vendor,
          price: v.price,                       // Shopify price is already major units on .json
          was_price: v.compare_at_price,
          in_stock: v.available,
          url: `${BASE}/products/${p.handle}`,
          barcode: v.barcode,
        }));
      }
    }
    if (batch.length < 250) break;
  }
  return products;
}

module.exports = { slug: 'dolcesalato', scrape };
