// Offline proof-of-pipeline: scrape Dolce & Salato, load our catalog from the
// local pricing xlsx, match, and print item-level + website-level metrics.
// No Supabase required. Great for sanity-checking before wiring the DB.
//
//   node scripts/try-dolcesalato.js "C:/Users/Giovanni.sacca/OneDrive/Desktop/Pricing/Pricing_STD_4_23.xlsx"

const path = require('path');
const XLSX = require('xlsx');
const dolcesalato = require('../src/scrapers/dolcesalato');
const { normalizeName, parseSize } = require('../src/lib/normalize');
const { rankCandidates, AUTO_ACCEPT } = require('../src/lib/match');
const { tokenSet } = require('../src/lib/normalize');

function baseUnit(u){u=(u||'').toLowerCase();if(['kg','g','mg','gr'].includes(u))return 'g';if(['l','ml','cl','lt'].includes(u))return 'ml';return u||null;}
function toBase(v,u){u=(u||'').toLowerCase();if(u==='kg'||u==='l'||u==='lt')return v*1000;if(u==='cl')return v*10;if(u==='mg')return v/1000;return v;}

function loadCatalog(file) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  const H = Array.from(rows[0], h => String(h ?? '').toLowerCase());
  const ci = H.findIndex(h => h.includes('itemcode') || h === 'code');
  const ni = H.findIndex(h => h.includes('itemname') || h === 'name');
  const pi = H.findIndex(h => h.includes('live price'));
  const items = [];
  for (let r = 1; r < rows.length; r++) {
    const code = rows[r][ci], name = rows[r][ni];
    if (!code || !name || String(code).toLowerCase() === 'total') continue;
    const price = pi >= 0 ? parseFloat(rows[r][pi]) : null;
    const size = parseSize(name);
    items.push({ item_code: String(code), item_name: String(name), our_price: isFinite(price) ? price : null,
      norm_name: normalizeName(name),
      size: size ? { base_value: toBase(size.value, size.unit), base_unit: baseUnit(size.unit) } : null });
  }
  return items;
}

(async () => {
  const file = process.argv[2] || 'C:/Users/Giovanni.sacca/OneDrive/Desktop/Pricing/Pricing_STD_4_23.xlsx';
  console.log('Scraping Dolce & Salato...');
  const comp = await dolcesalato.scrape();
  console.log(`  ${comp.length} competitor products fetched`);

  console.log('Loading catalog:', path.basename(file));
  const items = loadCatalog(file);
  console.log(`  ${items.length} catalog items (${items.filter(i=>i.our_price!=null).length} priced)`);

  // token index over competitor products
  const index = new Map();
  comp.forEach((c, idx) => { for (const t of tokenSet(c.norm_name)) { if(!index.has(t)) index.set(t,[]); index.get(t).push(idx);} });

  const matches = [];
  for (const it of items) {
    const ids = new Set();
    for (const t of tokenSet(it.norm_name)) (index.get(t)||[]).forEach(i=>ids.add(i));
    if (!ids.size) continue;
    const cands = [...ids].map(i => ({ i, norm_name: comp[i].norm_name, barcode: comp[i].barcode, size: comp[i].size }));
    const ranked = rankCandidates({ norm_name: it.norm_name, barcode: null, size: it.size }, cands);
    const best = ranked[0];
    if (!best || best.score < AUTO_ACCEPT) continue;
    const c = comp[best.cand.i];
    if (!c.price || it.our_price == null) continue;
    matches.push({ item: it, comp: c, score: best.score, pcr: it.our_price / c.price * 100 });
  }

  matches.sort((a,b)=>a.pcr-b.pcr);
  console.log(`\n${matches.length} priced matches (score >= ${AUTO_ACCEPT}). Sample:\n`);
  console.log('OUR ITEM'.padEnd(42), 'OUR', ' THEIR', ' PCR%', ' MATCH');
  for (const m of matches.slice(0, 20)) {
    console.log(
      m.item.item_name.slice(0,40).padEnd(42),
      String(m.item.our_price).padStart(4),
      String(m.comp.price).padStart(6),
      (m.pcr.toFixed(0)+'%').padStart(5),
      ' ', m.comp.title.slice(0,34));
  }

  if (matches.length) {
    const pcrs = matches.map(m=>m.pcr).sort((a,b)=>a-b);
    const median = pcrs[Math.floor(pcrs.length/2)];
    const cheaper = matches.filter(m=>m.item.our_price < m.comp.price).length;
    console.log('\n--- Dolce & Salato website metrics ---');
    console.log('items matched (1IF):', matches.length);
    console.log('coverage of priced catalog:', (matches.length/items.filter(i=>i.our_price!=null).length*100).toFixed(1)+'%');
    console.log('Price Index (median PCR):', median.toFixed(1), median<100?'(we are cheaper)':'(we are pricier)');
    console.log('win rate (we cheaper):', (cheaper/matches.length*100).toFixed(1)+'%');
  }
})().catch(e => { console.error(e); process.exit(1); });
