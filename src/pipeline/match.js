// Match our catalog to competitor products -> product_matches.
//
//   node src/pipeline/match.js            # all competitors
//   node src/pipeline/match.js spinneys
//
// For each competitor we index its products by token, generate candidates for
// each of our items, score them, and store any above REVIEW_FLOOR. Auto-accept
// above AUTO_ACCEPT; the rest are stored unconfirmed for human review. Existing
// manual/confirmed/rejected matches are never overwritten.

const { supabase, upsertChunked } = require('../lib/db');
const { rankCandidates, AUTO_ACCEPT, REVIEW_FLOOR } = require('../lib/match');
const { tokenSet } = require('../lib/normalize');

async function fetchAll(table, cols, filter) {
  const out = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let q = supabase.from(table).select(cols).range(from, from + pageSize - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

function asItem(row) {
  return {
    norm_name: row.norm_name || '',
    barcode: row.barcode || null,
    size: row.size_value ? { base_value: toBase(row.size_value, row.size_unit), base_unit: baseUnit(row.size_unit) } : null,
  };
}
function baseUnit(u) { u = (u || '').toLowerCase(); if (['kg','g','mg','gr'].includes(u)) return 'g'; if (['l','ml','cl','lt'].includes(u)) return 'ml'; return u || null; }
function toBase(v, u) { u = (u || '').toLowerCase(); if (u === 'kg') return v * 1000; if (u === 'l' || u === 'lt') return v * 1000; if (u === 'cl') return v * 10; if (u === 'mg') return v / 1000; return v; }

async function matchCompetitor(slug) {
  const items = await fetchAll('catalog_items', 'item_code, norm_name, barcode, size_value, size_unit',
    q => q.eq('is_active', true));
  const cps = await fetchAll('competitor_products', 'id, norm_name, barcode, size_value, size_unit',
    q => q.eq('competitor', slug));
  if (!cps.length) { console.log(`- ${slug}: no competitor products; skip`); return; }

  // Inverted index: token -> candidate ids (keeps candidate generation cheap).
  const index = new Map();
  const candById = new Map();
  for (const cp of cps) {
    candById.set(cp.id, cp);
    for (const t of tokenSet(cp.norm_name)) {
      if (!index.has(t)) index.set(t, []);
      index.get(t).push(cp.id);
    }
    if (cp.barcode) {
      const bk = `bc:${cp.barcode}`;
      if (!index.has(bk)) index.set(bk, []);
      index.get(bk).push(cp.id);
    }
  }

  // Don't clobber human decisions.
  const locked = new Set(
    (await fetchAll('product_matches', 'item_code, competitor_product_id, match_method, is_confirmed, is_rejected',
      q => q.eq('competitor', slug)))
      .filter(m => m.is_confirmed || m.is_rejected || m.match_method === 'manual')
      .map(m => `${m.item_code}|${m.competitor_product_id}`)
  );

  const rows = [];
  let auto = 0, review = 0;
  for (const it of items) {
    const item = asItem(it);
    // gather candidate ids by shared tokens (+ barcode)
    const ids = new Set();
    if (item.barcode && index.has(`bc:${item.barcode}`)) index.get(`bc:${item.barcode}`).forEach(id => ids.add(id));
    for (const t of tokenSet(item.norm_name)) (index.get(t) || []).forEach(id => ids.add(id));
    if (!ids.size) continue;

    const cands = [...ids].map(id => {
      const cp = candById.get(id);
      return { id, norm_name: cp.norm_name, barcode: cp.barcode,
        size: cp.size_value ? { base_value: toBase(cp.size_value, cp.size_unit), base_unit: baseUnit(cp.size_unit) } : null };
    });

    const ranked = rankCandidates(item, cands);
    const best = ranked[0];
    if (!best || best.score < REVIEW_FLOOR) continue;
    if (locked.has(`${it.item_code}|${best.cand.id}`)) continue;

    const accepted = best.score >= AUTO_ACCEPT;
    if (accepted) auto++; else review++;
    rows.push({
      item_code: it.item_code, competitor: slug, competitor_product_id: best.cand.id,
      match_method: best.method, confidence: Number(best.score.toFixed(3)),
      is_confirmed: false, is_rejected: false,
    });
  }

  if (rows.length) await upsertChunked('product_matches', rows, { onConflict: 'item_code,competitor,competitor_product_id' });
  console.log(`- ${slug}: ${rows.length} matches written (${auto} auto-accept >= ${AUTO_ACCEPT}, ${review} for review)`);
}

async function main() {
  const wanted = process.argv.slice(2);
  const slugs = wanted.length ? wanted : ['spinneys', 'carrefour', 'waitrose', 'dolcesalato', 'grandiose', 'viva'];
  for (const slug of slugs) await matchCompetitor(slug);
  console.log('Matching done.');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { matchCompetitor };
