// Matching engine: given one of our catalog items, find the best competitor
// product. Grocery matching is noisy, so we score on several axes and only
// auto-accept above a threshold; everything else is left for human review.

const { tokenSet } = require('./normalize');

// Jaccard overlap of two token sets.
function jaccard(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter++;
  return inter / (aSet.size + bSet.size - inter);
}

// Fraction of our tokens that appear in theirs (containment — good when their
// title has extra marketing words).
function containment(aSet, bSet) {
  if (!aSet.size) return 0;
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter++;
  return inter / aSet.size;
}

// Size agreement: 1 if base sizes match within 2%, scaled down otherwise.
function sizeScore(a, b) {
  if (!a || !b) return null;                 // unknown -> neutral, handled by caller
  if (a.base_unit !== b.base_unit) return 0; // g vs ml -> different product form
  const hi = Math.max(a.base_value, b.base_value);
  const lo = Math.min(a.base_value, b.base_value);
  if (hi === 0) return 0;
  const ratio = lo / hi;
  if (ratio >= 0.98) return 1;
  if (ratio >= 0.9) return 0.7;
  if (ratio >= 0.75) return 0.3;
  return 0;
}

// Combined confidence 0..1 for a candidate pair.
// item / cand are objects: { norm_name, size, barcode }
function scorePair(item, cand) {
  // Barcode is ground truth.
  if (item.barcode && cand.barcode && String(item.barcode) === String(cand.barcode)) {
    return { score: 1, method: 'barcode', reasons: ['barcode'] };
  }

  const aSet = tokenSet(item.norm_name);
  const bSet = tokenSet(cand.norm_name);
  const jac = jaccard(aSet, bSet);
  const con = containment(aSet, bSet);
  const nameScore = 0.5 * jac + 0.5 * con;    // reward both overlap and containment

  const sz = sizeScore(item.size, cand.size);
  // Weight: name 70%, size 30%. If size unknown on either side, lean on name.
  let score;
  if (sz === null) {
    score = nameScore * 0.85;                 // penalize slightly for uncertainty
  } else {
    score = 0.7 * nameScore + 0.3 * sz;
    if (sz === 0 && nameScore < 0.9) score *= 0.5; // wrong size is a strong negative
  }

  const reasons = [`name=${nameScore.toFixed(2)}`, sz === null ? 'size=?' : `size=${sz}`];
  return { score: Math.min(1, score), method: 'auto', reasons };
}

// Rank all candidates for one item; return sorted best-first.
function rankCandidates(item, candidates) {
  return candidates
    .map(cand => ({ cand, ...scorePair(item, cand) }))
    .sort((x, y) => y.score - x.score);
}

// Default auto-accept threshold. Tune per competitor in config if needed.
const AUTO_ACCEPT = 0.62;
const REVIEW_FLOOR = 0.40;   // below this we don't even store a candidate

module.exports = { scorePair, rankCandidates, jaccard, containment, sizeScore, AUTO_ACCEPT, REVIEW_FLOOR };
