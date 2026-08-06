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

  const gaps = computeGaps(compProducts, allMatches, latestPrices, competitorsRes.data, catalog);

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

// How replenishable / repeat-driving a category is (proxy until real order data
// is connected). Staples like coffee, pasta, tomato base drive re-purchase.
const REPEAT_WEIGHT = {
  'Drinks': 1.0, 'Pantry – Tomato Base': 0.95, 'Pasta & Rice': 0.95, 'Pantry – Pasta Sauce': 0.85,
  'Dairy, Eggs & Chilled': 0.9, 'Cheese': 0.85, 'Flour': 0.85, 'Bakery': 0.8,
  'Pantry': 0.75, 'Fruit & Vegetables': 0.7, 'Chilled Meat & Fish': 0.7,
  'Frozen': 0.6, 'Quick Meals': 0.6, 'Uncategorised': 0.5,
};

// Assortment gaps + a flywheel-style Selection Score. A competitor product is a
// gap if it has no accepted match to our catalogue. We score each gap brand on
// factors that reinforce each other (Amazon-flywheel logic): proven demand →
// range depth → category completeness → fits what we already sell → drives
// repeat. Cross-sell and repeat use heuristic proxies (category adjacency and
// replenishability) until real order data is connected.
function computeGaps(compProducts, allMatches, latestPrices, competitors, catalog) {
  const nameOf = Object.fromEntries((competitors || []).map(c => [c.slug, c.name]));
  const priceOf = new Map(latestPrices.map(p => [p.competitor_product_id, p.price]));
  const nComp = (competitors || []).length || 3;

  // where WE already have depth (for the cross-sell / range-extension proxy)
  const ourByCat = {};
  for (const it of catalog) { const c = it.category || 'Uncategorised'; ourByCat[c] = (ourByCat[c] || 0) + 1; }
  const maxOurCat = Math.max(1, ...Object.values(ourByCat));

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

  // category breakdown
  const catMap = {};
  for (const g of gapProducts) {
    const c = catMap[g.category] || (catMap[g.category] = { skus: 0, comps: new Set() });
    c.skus++; c.comps.add(g.competitor);
  }
  const categories = Object.entries(catMap).map(([category, v]) => ({
    category, skus: v.skus, competitors: v.comps.size,
  })).sort((a, b) => b.skus - a.skus);
  const maxCatGap = Math.max(1, ...categories.map(c => c.skus));

  // per-brand aggregation + flywheel Selection Score
  const brandMap = {};
  for (const g of gapProducts) {
    if (g.brand === 'Unbranded / other') continue;
    const b = brandMap[g.brand] || (brandMap[g.brand] = { skus: 0, comps: new Set(), cats: {} });
    b.skus++; b.comps.add(g.competitor); b.cats[g.category] = (b.cats[g.category] || 0) + 1;
  }

  const recommendations = Object.entries(brandMap).map(([brand, v]) => {
    const primary = Object.entries(v.cats).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Uncategorised';
    const demand = v.comps.size / nComp;                       // proven demand
    const depth = Math.min(1, v.skus / 20);                    // range depth
    const pull = (catMap[primary]?.skus || 0) / maxCatGap;     // category size / traffic
    const adjacency = (ourByCat[primary] || 0) / maxOurCat;    // extends a range we already sell
    const repeat = REPEAT_WEIGHT[primary] ?? 0.5;              // replenishability proxy
    const score = Math.round(100 * (0.30 * demand + 0.15 * depth + 0.15 * pull + 0.20 * adjacency + 0.20 * repeat));

    // plain-English "why", strongest factors first
    const why = [];
    if (v.comps.size >= 3) why.push('stocked by all 3 rivals');
    else if (v.comps.size === 2) why.push('stocked by 2 of 3 rivals');
    else why.push('stocked by 1 rival');
    if (v.skus >= 10) why.push(`deep range (${v.skus} SKUs)`);
    if (repeat >= 0.85) why.push('replenishable staple (repeat driver)');
    if (adjacency >= 0.5) why.push(`extends ${primary}, where you already sell`);
    else if (adjacency > 0 && adjacency < 0.15) why.push(`opens up ${primary}, thin for you today`);

    return {
      brand, score, competitors: v.comps.size, skus: v.skus, category: primary,
      repeat: Math.round(repeat * 100), adjacency: Math.round(adjacency * 100),
      why: why.slice(0, 3).join(' · '),
    };
  }).sort((a, b) => b.score - a.score);

  // headline recommendation cards
  const multi = recommendations.filter(r => r.competitors >= 2);
  const pool = multi.length ? multi : recommendations;
  const byDepth = [...recommendations].sort((a, b) => b.competitors - a.competitors || b.skus - a.skus);
  const byCrossSell = [...pool].sort((a, b) => b.adjacency - a.adjacency || b.score - a.score);
  const byRepeat = [...pool].sort((a, b) => b.repeat - a.repeat || b.competitors - a.competitors);
  const headlines = {
    top_pick: recommendations[0] || null,
    biggest_brand: byDepth[0] || null,
    biggest_category: categories[0] || null,
    best_crosssell: byCrossSell[0] || null,
    best_repeat: byRepeat[0] || null,
  };

  return {
    per_competitor: Object.entries(perComp).map(([slug, v]) => ({ slug, name: nameOf[slug] || slug, ...v })),
    total_gap_skus: gapProducts.length,
    recommendations,
    headlines,
    categories,
    sample_products: gapProducts.filter(g => g.brand !== 'Unbranded / other').slice(0, 300),
  };
}
