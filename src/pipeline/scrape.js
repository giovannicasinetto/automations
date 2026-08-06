// Run scrapers -> competitor_products + price_snapshots.
//
//   node src/pipeline/scrape.js                 # all active competitors
//   node src/pipeline/scrape.js spinneys carrefour
//
// Query set: derived from our catalog. We search each competitor for the
// distinctive part of every catalog item name (deduped) so we only pull the
// products that could plausibly match ours. Dolce Salato ignores queries and
// pulls its whole Shopify catalog.

const crypto = require('crypto');
const { ALL, get } = require('../scrapers');
const { supabase, upsertChunked } = require('../lib/db');

// Build a compact, deduped keyword list from catalog norm_names.
function buildQueries(items, { max = 300 } = {}) {
  const freq = new Map();
  for (const it of items) {
    const toks = (it.norm_name || '').split(/\s+/).filter(t => t.length > 2);
    // use the two most "product-defining" tokens (first two after normalize)
    const key = toks.slice(0, 2).join(' ').trim();
    if (!key) continue;
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  return [...freq.keys()].slice(0, max);
}

async function loadCatalog() {
  const { data, error } = await supabase
    .from('catalog_items')
    .select('item_code, norm_name')
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  return data || [];
}

async function persist(slug, products, runId) {
  if (!products.length) return { products: 0, snapshots: 0 };
  const now = new Date().toISOString();

  // Upsert competitor_products (identity on competitor+ext_id).
  const rows = products
    .filter(p => p.ext_id)
    .map(p => ({
      competitor: slug, ext_id: p.ext_id, title: p.title, brand: p.brand,
      size_value: p.size ? p.size.value : null, size_unit: p.size ? p.size.unit : null,
      barcode: p.barcode, url: p.url, norm_name: p.norm_name, last_seen: now,
    }));
  const saved = await upsertChunked('competitor_products', rows, { onConflict: 'competitor,ext_id' });

  // Map ext_id -> id to attach snapshots.
  const idByExt = new Map(saved.map(r => [r.ext_id, r.id]));
  const snaps = products
    .filter(p => p.ext_id && idByExt.has(p.ext_id))
    .map(p => ({
      competitor_product_id: idByExt.get(p.ext_id),
      competitor: slug, run_id: runId,
      price: p.price, was_price: p.was_price, in_stock: p.in_stock, scraped_at: now,
    }));
  await upsertChunked('price_snapshots', snaps, {});
  return { products: saved.length, snapshots: snaps.length };
}

async function main() {
  const runId = crypto.randomUUID();
  const wanted = process.argv.slice(2);
  const slugs = wanted.length ? wanted : Object.keys(ALL);

  const catalog = await loadCatalog().catch(e => { console.warn('[scrape] no catalog yet:', e.message); return []; });
  const queries = buildQueries(catalog);
  console.log(`run ${runId} | ${slugs.length} competitor(s) | ${queries.length} search queries\n`);

  await supabase.from('metric_runs').insert({ run_id: runId, note: 'scrape' });

  const onProgress = (p) => {
    if (p.error) process.stdout.write(`  ! ${p.slug} "${p.q}" ${p.error}\n`);
    else process.stdout.write(`  ${p.slug} [${p.i + 1}/${p.total}] "${p.q}" +${p.found} (total ${p.running})\r`);
  };

  for (const slug of slugs) {
    const scraper = get(slug);
    if (!scraper) { console.warn(`unknown competitor: ${slug}`); continue; }
    if (scraper.note) { console.log(`- ${slug}: skipped (${scraper.note})`); continue; }
    console.log(`- ${slug}: scraping...`);
    try {
      const products = await scraper.scrape({ queries, onProgress });
      const res = await persist(slug, products, runId);
      console.log(`\n  ${slug}: ${products.length} products -> ${res.products} stored, ${res.snapshots} price points`);
    } catch (e) {
      console.error(`\n  ${slug} FAILED: ${e.message}`);
    }
  }
  console.log(`\nDone. run_id=${runId}`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { buildQueries };
