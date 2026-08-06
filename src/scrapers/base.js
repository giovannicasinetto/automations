// Shared scraper utilities: a canonical product shape, and a defensive
// extractor that pulls product records out of an arbitrary API JSON blob.
// The heuristic extractor means an adapter keeps working even when a site
// tweaks its response shape, as long as records still carry a name + price.

const { normalizeName, parseSize } = require('../lib/normalize');

// Canonical product every scraper must return.
function buildProduct({ ext_id, title, brand, price, was_price, in_stock, url, barcode }) {
  const t = (title || '').trim();
  return {
    ext_id: ext_id != null ? String(ext_id) : null,
    title: t,
    brand: brand || null,
    price: toNum(price),
    was_price: toNum(was_price),
    in_stock: in_stock == null ? null : !!in_stock,
    url: url || null,
    barcode: barcode ? String(barcode) : null,
    size: parseSize(t),
    norm_name: normalizeName(t),
  };
}

function toNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return isFinite(n) ? n : null;
}

const NAME_KEYS  = ['name', 'title', 'productName', 'product_name', 'displayName', 'label'];
const PRICE_KEYS = ['price', 'sellingPrice', 'salePrice', 'finalPrice', 'currentPrice', 'amount', 'value', 'minBuyingPrice'];
const WAS_KEYS   = ['wasPrice', 'was_price', 'oldPrice', 'listPrice', 'regularPrice', 'originalPrice', 'strikePrice'];
const ID_KEYS    = ['id', 'sku', 'productId', 'product_id', 'code', 'uid', 'objectID'];
const BARCODE_KEYS = ['barcode', 'ean', 'upc', 'gtin'];
const URL_KEYS   = ['url', 'link', 'productUrl', 'href', 'slug'];
const BRAND_KEYS = ['brand', 'brandName', 'manufacturer'];

function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
    // nested price objects like {price:{value:12}}
    if (obj[k] && typeof obj[k] === 'object') {
      const nested = pick(obj[k], ['value', 'amount', 'centAmount', 'raw', 'formattedValue']);
      if (nested != null) return nested;
    }
  }
  return null;
}

// Does this plain object look like a product record?
function looksLikeProduct(o) {
  if (!o || typeof o !== 'object') return false;
  const hasName = NAME_KEYS.some(k => typeof o[k] === 'string' && o[k].length > 2);
  const hasPrice = PRICE_KEYS.some(k => o[k] != null && (typeof o[k] === 'number' || typeof o[k] === 'string' || typeof o[k] === 'object'));
  return hasName && hasPrice;
}

// Walk any JSON structure and yield product-looking objects.
function* findProductObjects(node, depth = 0) {
  if (!node || depth > 8) return;
  if (Array.isArray(node)) {
    for (const el of node) yield* findProductObjects(el, depth + 1);
    return;
  }
  if (typeof node === 'object') {
    if (looksLikeProduct(node)) yield node;
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') yield* findProductObjects(v, depth + 1);
    }
  }
}

// Turn a raw API blob into canonical products, de-duped by ext_id/title.
function extractProducts(blob, { baseUrl } = {}) {
  const seen = new Set();
  const out = [];
  for (const o of findProductObjects(blob)) {
    const title = pick(o, NAME_KEYS);
    if (!title) continue;
    const ext_id = pick(o, ID_KEYS);
    const key = ext_id != null ? `id:${ext_id}` : `t:${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let url = pick(o, URL_KEYS);
    if (url && baseUrl && !/^https?:/i.test(url)) url = new URL(url, baseUrl).href;
    out.push(buildProduct({
      ext_id, title,
      brand: pick(o, BRAND_KEYS),
      price: pick(o, PRICE_KEYS),
      was_price: pick(o, WAS_KEYS),
      in_stock: o.inStock ?? o.available ?? o.in_stock ?? null,
      url,
      barcode: pick(o, BARCODE_KEYS),
    }));
  }
  return out;
}

module.exports = { buildProduct, extractProducts, findProductObjects, toNum };
