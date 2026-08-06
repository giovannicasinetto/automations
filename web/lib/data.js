// Server-side data loader. Runs only on the server (uses the Supabase service
// role key), so the key is never exposed to the browser. Produces the exact
// shape the client Dashboard expects.

import { createClient } from '@supabase/supabase-js';
import { deriveBrand, deriveCategory } from './taxonomy';

const ACCEPT = 0.62; // must match src/lib/match.js AUTO_ACCEPT

function client() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function fetchAll(sb, view, cols, mod) {
  const out = []; const page = 1000;
  for (let from = 0; ; from += page) {
    let q = sb.from(view).select(cols).range(from, from + page - 1);
    if (mod) q = mod(q);
    const { data, error } = await q;
    if (error) throw new Error(`${view}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return out;
}

const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = Math.floor(s.length / 2); return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
const r1 = n => n == null ? null : Math.round(n * 10) / 10;

export async function getDashboardData() {
  const sb = client();
  const [competitorsRes, summaryRes, metrics, items, catalog, compProducts, allMatches, latestPrices] = await Promise.all([
    sb.from('competitors').select('slug,name'),
    sb.from('v_catalog_summary').select('*').single(),
    fetchAll(sb, 'website_metrics', 'competitor,items_found,coverage_pct,price_index,price_index_wtd,win_rate_pct,median_gap_pct,computed_at'),
    fetchAll(sb, 'v_item_competitiveness', 'competitor,item_code,item_name,our_price,their_price,pcr,gap_pct,we_are_cheaper,confidence,match_method,competitor_title,competitor_url'),
    fetchAll(sb, 'catalog_items', 'item_code,brand,category', q => q.eq('is_active', true)),
    fetchAll(sb, 'competitor_products', 'id,competitor,title,url'),
    fetchAll(sb, 'product_matches', 'competitor_product_id,confidence,match_method,is_confirmed,is_rejected'),
    fetchAll(sb, 'v_latest_price', 'competitor_product_id,price'),
  ]);

  const brandOf = new Map(catalog.map(c => [c.item_code, c.brand || 'Unbranded / other']));
  const catOf = new Map(catalog.map(c => [c.item_code, c.category || 'Uncategorised']));

  // Accepted matches only (gate identical to the pipeline).
  const accepted = items.filter(i => i.confidence >= ACCEPT || i.match_method === 'manual' || i.match_method === 'barcode');
  const bySlug = {};
  for (const i of accepted) (bySlug[i.competitor] = bySlug[i.competitor] || []).push(i);

  // Metrics history per competitor (for the trend), sorted by time.
  const histBySlug = {};
  for (const m of metrics.sort((a, b) => new Date(a.computed_at) - new Date(b.computed_at))) {
    (histBySlug[m.competitor] = histBySlug[m.competitor] || []).push(m);
  }

  const competitors = competitorsRes.data.map(c => {
    const hist = histBySlug[c.slug] || [];
    const latest = hist[hist.length - 1];
    const ms = (bySlug[c.slug] || []).map(i => ({
      item_code: i.item_code,
      our_item: i.item_name,
      our_price: Number(i.our_price),
      their_item: i.competitor_title,
      their_price: Number(i.their_price),
      url: i.competitor_url,
      confidence: Number(i.confidence),
      pcr: Number(i.pcr),
      gap_pct: Number(i.gap_pct),
      we_cheaper: i.we_are_cheaper,
      brand: brandOf.get(i.item_code) || 'Unbranded / other',
      category: catOf.get(i.item_code) || 'Uncategorised',
    }));
    const status = c.slug === 'viva' ? 'disabled' : (ms.length ? 'live' : 'pending');
    return {
      slug: c.slug, name: c.name, status,
      items_found: latest ? latest.items_found : ms.length,
      coverage_pct: latest ? Number(latest.coverage_pct) : null,
      price_index: latest ? Number(latest.price_index) : r1(median(ms.map(m => m.pcr))),
      price_index_wtd: latest ? Number(latest.price_index_wtd) : null,
      win_rate_pct: latest ? Number(latest.win_rate_pct) : null,
      hist_index: hist.map(h => Number(h.price_index)),
      hist_labels: hist.map(h => new Date(h.computed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })),
      matches: ms,
    };
  });

  const gaps = computeGaps(compProducts, allMatches, latestPrices, competitorsRes.data);

  return {
    summary: {
      total_items: summaryRes.data?.total_items ?? catalog.length,
      priced_items: summaryRes.data?.priced_items ?? null,
      total_brands: summaryRes.data?.total_brands ?? null,
      total_categories: summaryRes.data?.total_categories ?? null,
    },
    competitors,
    gaps,
    generated_at: new Date().toISOString(),
  };
}

// Assortment gaps = competitor products with NO accepted match to our catalogue.
// Grouped into a launch shortlist by brand (with cross-competitor demand signal)
// and by category, plus a sample of specific products.
function computeGaps(compProducts, allMatches, latestPrices, competitors) {
  const nameOf = Object.fromEntries((competitors || []).map(c => [c.slug, c.name]));
  const priceOf = new Map(latestPrices.map(p => [p.competitor_product_id, p.price]));

  const matched = new Set();
  for (const m of allMatches) {
    if (m.is_rejected) continue;
    if (m.is_confirmed || m.match_method === 'manual' || m.match_method === 'barcode' || m.confidence >= ACCEPT)
      matched.add(m.competitor_product_id);
  }

  const perComp = {};
  for (const cp of compProducts) (perComp[cp.competitor] = perComp[cp.competitor] || { scraped: 0, gap: 0 }).scraped++;

  const gapProducts = [];
  for (const cp of compProducts) {
    if (matched.has(cp.id)) continue;
    perComp[cp.competitor].gap++;
    gapProducts.push({
      competitor: cp.competitor, competitor_name: nameOf[cp.competitor] || cp.competitor,
      title: cp.title, url: cp.url, price: priceOf.get(cp.id) ?? null,
      brand: deriveBrand(cp.title) || 'Unbranded / other',
      category: deriveCategory(cp.title) || 'Uncategorised',
    });
  }

  // brand shortlist (exclude unbranded), ranked by #competitors then #SKUs
  const brandMap = {};
  for (const g of gapProducts) {
    if (g.brand === 'Unbranded / other') continue;
    const b = brandMap[g.brand] || (brandMap[g.brand] = { skus: 0, comps: new Set(), cats: {} });
    b.skus++; b.comps.add(g.competitor); b.cats[g.category] = (b.cats[g.category] || 0) + 1;
  }
  const brands = Object.entries(brandMap).map(([brand, v]) => ({
    brand, competitors: v.comps.size, skus: v.skus,
    top_category: Object.entries(v.cats).sort((a, b) => b[1] - a[1])[0]?.[0] || '—',
  })).sort((a, b) => b.competitors - a.competitors || b.skus - a.skus);

  // category breakdown
  const catMap = {};
  for (const g of gapProducts) {
    const c = catMap[g.category] || (catMap[g.category] = { skus: 0, comps: new Set() });
    c.skus++; c.comps.add(g.competitor);
  }
  const categories = Object.entries(catMap).map(([category, v]) => ({
    category, skus: v.skus, competitors: v.comps.size,
  })).sort((a, b) => b.skus - a.skus);

  return {
    per_competitor: Object.entries(perComp).map(([slug, v]) => ({ slug, name: nameOf[slug] || slug, ...v })),
    total_gap_skus: gapProducts.length,
    brands,
    categories,
    // sample of branded gap products for drill-down (keep payload sane)
    sample_products: gapProducts.filter(g => g.brand !== 'Unbranded / other').slice(0, 300),
  };
}
