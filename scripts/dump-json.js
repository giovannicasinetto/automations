// Dump Dolce & Salato matches as JSON for the dashboard preview.
const XLSX = require('xlsx');
const dolcesalato = require('../src/scrapers/dolcesalato');
const { normalizeName, parseSize, tokenSet } = require('../src/lib/normalize');
const { deriveBrand, deriveCategory } = require('../src/lib/taxonomy');
const { rankCandidates, AUTO_ACCEPT } = require('../src/lib/match');

function baseUnit(u){u=(u||'').toLowerCase();if(['kg','g','mg','gr'].includes(u))return 'g';if(['l','ml','cl','lt'].includes(u))return 'ml';return u||null;}
function toBase(v,u){u=(u||'').toLowerCase();if(u==='kg'||u==='l'||u==='lt')return v*1000;if(u==='cl')return v*10;if(u==='mg')return v/1000;return v;}

function loadCatalog(file) {
  const wb = XLSX.readFile(file); const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws,{header:1,blankrows:false});
  const H = Array.from(rows[0],h=>String(h??'').toLowerCase());
  const ci=H.findIndex(h=>h.includes('itemcode')), ni=H.findIndex(h=>h.includes('itemname')), pi=H.findIndex(h=>h.includes('live price'));
  const cat=H.findIndex(h=>h.includes('status'));
  const items=[];
  for(let r=1;r<rows.length;r++){const code=rows[r][ci],name=rows[r][ni];if(!code||!name||String(code).toLowerCase()==='total')continue;
    const price=pi>=0?parseFloat(rows[r][pi]):null;const size=parseSize(name);
    items.push({item_code:String(code),item_name:String(name),our_price:isFinite(price)?price:null,norm_name:normalizeName(name),
      size:size?{base_value:toBase(size.value,size.unit),base_unit:baseUnit(size.unit)}:null});}
  return items;
}

(async()=>{
  const file=process.argv[2]||'C:/Users/Giovanni.sacca/OneDrive/Desktop/Pricing/Pricing_STD_4_23.xlsx';
  const comp=await dolcesalato.scrape();
  const items=loadCatalog(file);
  const index=new Map();
  comp.forEach((c,idx)=>{for(const t of tokenSet(c.norm_name)){if(!index.has(t))index.set(t,[]);index.get(t).push(idx);}});
  const matches=[];
  for(const it of items){const ids=new Set();for(const t of tokenSet(it.norm_name))(index.get(t)||[]).forEach(i=>ids.add(i));if(!ids.size)continue;
    const cands=[...ids].map(i=>({i,norm_name:comp[i].norm_name,barcode:comp[i].barcode,size:comp[i].size}));
    const best=rankCandidates({norm_name:it.norm_name,barcode:null,size:it.size},cands)[0];
    if(!best||best.score<AUTO_ACCEPT)continue;const c=comp[best.i??best.cand.i];const cp=comp[best.cand.i];
    if(!cp.price||it.our_price==null)continue;
    matches.push({item_code:it.item_code,our_item:it.item_name,our_price:it.our_price,their_item:cp.title,their_price:cp.price,
      url:cp.url,confidence:Number(best.score.toFixed(2)),pcr:Number((it.our_price/cp.price*100).toFixed(1)),
      brand:deriveBrand(it.item_name)||'Unbranded / other',category:deriveCategory(it.item_name),
      gap_pct:Number(((cp.price-it.our_price)/cp.price*100).toFixed(1)),we_cheaper:it.our_price<cp.price});}
  matches.sort((a,b)=>a.pcr-b.pcr);
  const priced=items.filter(i=>i.our_price!=null).length;
  const pcrs=matches.map(m=>m.pcr).sort((a,b)=>a-b);
  const median=pcrs.length?pcrs[Math.floor(pcrs.length/2)]:null;
  const wtd=matches.length?Number((matches.reduce((s,m)=>s+m.our_price,0)/matches.reduce((s,m)=>s+m.their_price,0)*100).toFixed(1)):null;
  // Catalog-wide totals across ALL items (not just matched) via derivation.
  const allBrands=new Set(), allCats=new Set();
  for(const it of items){ allBrands.add(deriveBrand(it.item_name)||'Unbranded / other'); allCats.add(deriveCategory(it.item_name)); }
  const summary={total_items:items.length,priced_items:priced,total_brands:allBrands.size,total_categories:allCats.size};
  const out={generated_at:new Date().toISOString(),catalog_priced:priced,summary,competitors:[
    {slug:'dolcesalato',name:'Dolce & Salato',items_found:matches.length,coverage_pct:Number((matches.length/priced*100).toFixed(1)),
     price_index:median,price_index_wtd:wtd,win_rate_pct:Number((matches.filter(m=>m.we_cheaper).length/matches.length*100).toFixed(1)),
     matches}]};
  process.stdout.write(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
