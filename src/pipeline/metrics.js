// Compute website-level headline metrics and snapshot them into
// website_metrics so you can chart the index over time.
//
//   node src/pipeline/metrics.js
//
// The gating and outlier rules live HERE (not only in SQL views) so the numbers
// are correct regardless of view state: a match counts toward the headline only
// if it's confident (>= AUTO_ACCEPT) or a manual/barcode match; the weighted
// basket index ignores implausible ratios (data errors / bad matches).

const crypto = require('crypto');
const { supabase } = require('../lib/db');
const { AUTO_ACCEPT } = require('../lib/match');

const median = arr => { if (!arr.length) return null; const s=[...arr].sort((a,b)=>a-b); const i=Math.floor(s.length/2); return s.length%2?s[i]:(s[i-1]+s[i])/2; };
const round1 = n => n==null?null:Math.round(n*10)/10;
const pad = (v, n) => String(v ?? '-').padEnd(n);

async function fetchAll(view, cols) {
  const out = []; const page = 1000;
  for (let from=0;;from+=page){
    const { data, error } = await supabase.from(view).select(cols).range(from, from+page-1);
    if (error) throw new Error(`${view}: ${error.message}`);
    out.push(...(data||[]));
    if (!data || data.length < page) break;
  }
  return out;
}

async function main() {
  const runId = crypto.randomUUID();
  await supabase.from('metric_runs').insert({ run_id: runId, note: 'metrics' });

  // catalogue size (priced, active) for coverage denominator
  const { count: catalogSize, error: cErr } = await supabase
    .from('catalog_items').select('*', { count:'exact', head:true })
    .eq('is_active', true).not('our_price','is', null);
  if (cErr) throw new Error(cErr.message);

  const rows = await fetchAll('v_item_competitiveness',
    'competitor, our_price, their_price, pcr, gap_pct, we_are_cheaper, confidence, match_method');

  // Gate to accepted matches only.
  const accepted = rows.filter(r =>
    r.confidence >= AUTO_ACCEPT || r.match_method === 'manual' || r.match_method === 'barcode');

  // Group by competitor.
  const byComp = {};
  for (const r of accepted) (byComp[r.competitor] = byComp[r.competitor] || []).push(r);

  const results = Object.entries(byComp).map(([competitor, ms]) => {
    const inBand = ms.filter(m => m.pcr >= 10 && m.pcr <= 200);   // outlier guard for basket index
    const sumOurs = inBand.reduce((s,m)=>s+Number(m.our_price),0);
    const sumTheirs = inBand.reduce((s,m)=>s+Number(m.their_price),0);
    return {
      competitor,
      catalog_size: catalogSize,
      items_found: ms.length,
      coverage_pct: round1(ms.length / catalogSize * 100),
      price_index: round1(median(ms.map(m=>Number(m.pcr)))),
      price_index_wtd: sumTheirs ? round1(sumOurs / sumTheirs * 100) : null,
      win_rate_pct: round1(ms.filter(m=>m.we_are_cheaper).length / ms.length * 100),
      median_gap_pct: round1(median(ms.map(m=>Number(m.gap_pct)))),
    };
  });

  if (!results.length) { console.log('No accepted matches yet — run scrape + match first.'); return; }

  const snap = results.map(r => ({ run_id: runId, ...r, computed_at: new Date().toISOString() }));
  const { error: insErr } = await supabase.from('website_metrics').insert(snap);
  if (insErr) throw new Error(insErr.message);

  console.log(`\nRun ${runId} — website price competitiveness (accepted matches only)\n`);
  console.log('competitor    found  cover%  priceIdx  wtdIdx  win%   medGap%');
  console.log('-----------------------------------------------------------------');
  for (const d of results.sort((a,b)=>(a.price_index??999)-(b.price_index??999))) {
    console.log(`${pad(d.competitor,12)} ${pad(d.items_found,5)}  ${pad(d.coverage_pct,5)}  ${pad(d.price_index,7)}  ${pad(d.price_index_wtd,6)}  ${pad(d.win_rate_pct,4)}  ${pad(d.median_gap_pct,6)}`);
  }
  console.log('\npriceIdx < 100 => Casinetto is cheaper on the typical matched item. Snapshot saved to website_metrics.');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
