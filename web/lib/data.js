// Server-side data loader. Runs only on the server (uses the Supabase service
// role key), so the key is never exposed to the browser. Produces the exact
// shape the client Dashboard expects.

import { createClient } from '@supabase/supabase-js';

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
  const [competitorsRes, summaryRes, metrics, items, catalog] = await Promise.all([
    sb.from('competitors').select('slug,name'),
    sb.from('v_catalog_summary').select('*').single(),
    fetchAll(sb, 'website_metrics', 'competitor,items_found,coverage_pct,price_index,price_index_wtd,win_rate_pct,median_gap_pct,computed_at'),
    fetchAll(sb, 'v_item_competitiveness', 'competitor,item_code,item_name,our_price,their_price,pcr,gap_pct,we_are_cheaper,confidence,match_method,competitor_title,competitor_url'),
    fetchAll(sb, 'catalog_items', 'item_code,brand,category', q => q.eq('is_active', true)),
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

  return {
    summary: {
      total_items: summaryRes.data?.total_items ?? catalog.length,
      priced_items: summaryRes.data?.priced_items ?? null,
      total_brands: summaryRes.data?.total_brands ?? null,
      total_categories: summaryRes.data?.total_categories ?? null,
    },
    competitors,
    generated_at: new Date().toISOString(),
  };
}
