// Product-name normalization and pack-size parsing.
// Everything that touches matching goes through here so "our" items and
// competitor items are reduced to the same shape before comparison.

const STOPWORDS = new Set([
  'the', 'and', 'with', 'of', 'a', 'for', 'in', 'to', 'by',
  'fresh', 'premium', 'quality', 'original', 'classic', 'pack',
  'italian', 'imported', 'gourmet', 'selection', 'brand',
]);

// Common size units mapped to a canonical unit + multiplier to a base
// (grams for mass, millilitres for volume, piece for count).
const UNIT_MAP = {
  g: ['g'], gr: ['g'], gram: ['g'], grams: ['g'], grammes: ['g'],
  kg: ['g', 1000], kgs: ['g', 1000], kilo: ['g', 1000], kilos: ['g', 1000],
  mg: ['g', 0.001],
  ml: ['ml'], milliliter: ['ml'], millilitre: ['ml'], cc: ['ml'],
  l: ['ml', 1000], lt: ['ml', 1000], ltr: ['ml', 1000], litre: ['ml', 1000], liter: ['ml', 1000],
  cl: ['ml', 10],
  pc: ['pc'], pcs: ['pc'], piece: ['pc'], pieces: ['pc'], pack: ['pc'],
  x: ['pc'],
};

// Parse a size like "100g", "1.5 L", "6 x 90g", "500 ml" out of a name.
// Returns { value, unit, base_value, base_unit } or null.
function parseSize(text) {
  if (!text) return null;
  const s = String(text).toLowerCase();

  // multi-pack "6 x 90 g" -> total 540 g
  const multi = s.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|gr|gram|grams|ml|l|lt|ltr|litre|liter|cl|mg|pcs?|pieces?)\b/);
  if (multi) {
    const count = parseFloat(multi[1]);
    const each = parseFloat(multi[2]);
    const u = UNIT_MAP[multi[3]];
    if (u) {
      const baseEach = each * (u[1] || 1);
      return { value: count * each, unit: multi[3], base_value: count * baseEach, base_unit: u[0] };
    }
  }

  // single "100 g" / "1.5l" / "500ml"
  const single = s.match(/(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo|kilos|g|gr|gram|grams|grammes|mg|ml|milliliter|millilitre|cc|l|lt|ltr|litre|liter|cl|pcs?|pieces?)\b/);
  if (single) {
    const value = parseFloat(single[1].replace(',', '.'));
    const u = UNIT_MAP[single[2]];
    if (u) return { value, unit: single[2], base_value: value * (u[1] || 1), base_unit: u[0] };
  }
  return null;
}

// Reduce a name to a bag of significant tokens (brand-ish + product words).
function normalizeName(name) {
  if (!name) return '';
  let s = String(name).toLowerCase();
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, ''); // strip accents
  s = s.replace(/[^a-z0-9\s]/g, ' ');                       // punctuation -> space
  // remove size tokens so "parmigiano 100g" and "parmigiano 200g" share a stem
  s = s.replace(/\d+(?:[.,]\d+)?\s*(kg|kgs|g|gr|gram|grams|mg|ml|l|lt|ltr|litre|liter|cl|cc|pcs?|pieces?)\b/g, ' ');
  s = s.replace(/\b\d+\s*[x×]\s*\d+\b/g, ' ');
  const tokens = s.split(/\s+/).filter(t => t && t.length > 1 && !STOPWORDS.has(t));
  return tokens.join(' ').trim();
}

function tokenSet(normName) {
  return new Set(String(normName).split(/\s+/).filter(Boolean));
}

module.exports = { parseSize, normalizeName, tokenSet, STOPWORDS };
