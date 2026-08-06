// Import our PIM/pricing catalog into catalog_items.
//
//   node src/pipeline/import-catalog.js "C:/path/to/Pricing.xlsx"
//
// Accepts .xlsx or .csv. Column names are matched flexibly (see COLS). The
// default mapping targets the Casinetto pricing export
// (ItemCode / ItemName / Live Price / Cost / Sales YTD), but any export with a
// code, a name and a price will work.

const path = require('path');
const XLSX = require('xlsx');
const { normalizeName, parseSize } = require('../lib/normalize');
const { deriveBrand, deriveCategory } = require('../lib/taxonomy');
const { upsertChunked } = require('../lib/db');

// candidate header names (lower-cased, spaces/underscores stripped) per field
const COLS = {
  item_code: ['itemcode', 'sku', 'code', 'productcode', 'articlecode'],
  item_name: ['itemname', 'name', 'description', 'productname', 'title'],
  our_price: ['liveprice', 'retailprice', 'sellingprice', 'price', 'newstd', 'std'],
  cost:      ['cost', 'sapcosts', 'unitcost'],
  barcode:   ['barcode', 'ean', 'upc', 'gtin'],
  brand:     ['brand', 'vendor', 'suppliername', 'manufacturer'],
  category:  ['category', 'group', 'department', 'rowlabels'],
  sales_ytd: ['salesytd', 'sales'],
};

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function resolveMap(header) {
  // Index each header column by its normalized name.
  const colByName = {};
  header.forEach((h, i) => { const k = norm(h); if (k && colByName[k] == null) colByName[k] = i; });
  // For each field, pick the column matching the highest-priority candidate
  // (candidate order in COLS wins over physical column order).
  const map = {};
  for (const [field, cands] of Object.entries(COLS)) {
    for (const cand of cands) {
      if (colByName[cand] != null) { map[field] = colByName[cand]; break; }
    }
  }
  return map;
}

function loadRows(file) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
}

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node src/pipeline/import-catalog.js <catalog.xlsx|csv>'); process.exit(1); }

  const rows = loadRows(path.resolve(file));
  const map = resolveMap(rows[0]);
  if (map.item_code == null || map.item_name == null) {
    console.error('Could not find item code / name columns. Header was:', rows[0]);
    console.error('Resolved map:', map);
    process.exit(1);
  }
  console.log('Column mapping:', map);

  const items = [];
  const seen = new Set();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const code = row[map.item_code];
    const name = row[map.item_name];
    if (!code || !name || String(code).toLowerCase() === 'total') continue;
    if (seen.has(String(code))) continue;
    seen.add(String(code));

    const size = parseSize(name);
    // Use the export's brand/category if present; otherwise derive from name.
    const brandCol = map.brand != null ? (row[map.brand] || null) : null;
    const catCol = map.category != null ? (row[map.category] || null) : null;
    items.push({
      item_code: String(code).trim(),
      item_name: String(name).trim(),
      brand: brandCol || deriveBrand(name),
      category: catCol || deriveCategory(name),
      size_value: size ? size.value : null,
      size_unit: size ? size.unit : null,
      our_price: num(map.our_price != null ? row[map.our_price] : null),
      cost: num(map.cost != null ? row[map.cost] : null),
      barcode: map.barcode != null && row[map.barcode] ? String(row[map.barcode]).trim() : null,
      sales_ytd: num(map.sales_ytd != null ? row[map.sales_ytd] : null),
      norm_name: normalizeName(name),
      is_active: true,
      updated_at: new Date().toISOString(),
    });
  }

  const withPrice = items.filter(i => i.our_price != null).length;
  console.log(`Parsed ${items.length} items (${withPrice} with a price).`);

  const written = await upsertChunked('catalog_items', items, { onConflict: 'item_code' });
  console.log(`Upserted ${written.length} catalog_items into Supabase.`);
}

function num(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : null;
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { resolveMap, loadRows };
