# Casinetto — Competitor Price Intelligence

Scrapes UAE grocery competitors, matches their products to our PIM catalog, and
tracks **two headline metrics per website over time** in Supabase:

1. **1IF / Coverage** — of our catalog, how many items the competitor also
   sells (an item is "found" when we confidently match it to one of their
   products).
2. **Price Index** — how our price compares to theirs on the items both carry.

```
PIM catalog export ─► import-catalog ─► catalog_items
Competitor sites   ─► scrapers        ─► competitor_products + price_snapshots
                      match            ─► product_matches
                      metrics          ─► website_metrics  (time series)
```

## Competitors & data source

| Slug | Site | Platform | How we get prices | Status |
|---|---|---|---|---|
| `dolcesalato` | Dolce & Salato | Shopify | Open `products.json` | ✅ Working, verified (250 products) |
| `spinneys` | Spinneys | Algolia | Browser harvests search JSON | 🟡 Best-effort, verify selectors |
| `waitrose` | Waitrose UAE | Algolia | Browser harvests search JSON | 🟡 Best-effort, verify selectors |
| `grandiose` | Grandiose | Magento | Browser harvests search JSON | 🟡 Best-effort |
| `carrefour` | Carrefour UAE | Next.js + **Akamai** | Browser harvests `/api/v1/search` | 🟡 Anti-bot; needs a real browser |
| `viva` | Viva | WordPress | — | ⛔ No first-party catalog (sells via Talabat/noon) |

The 🟡 sites are JS/anti-bot front-ends. Rather than reverse-engineer their
private tokens, the scrapers drive a real headless browser (Playwright), let the
site make its own search calls, and **harvest the JSON it fetches**. A defensive
extractor (`src/scrapers/base.js`) pulls product records out of whatever shape
the response has, so an adapter keeps working through minor API changes. If a
site returns nothing, the fix is usually a one-line tweak to `searchUrl` /
`jsonMatch` in `src/scrapers/index.js`.

## The metrics (defined)

For a matched pair (our item *i* vs their product):

- **PCR — Price Competitiveness Ratio** = `our_price / their_price × 100`.
  - `< 100` → we're cheaper. *Ours 90, theirs 100 → 90%.*
  - `= 100` → parity. `> 100` → we're more expensive.
- **gap%** = `(their_price − our_price) / their_price × 100` (positive = we win).

Rolled up to a **website-level index** you monitor over time:

- **Price Index** = **median PCR** across all matched items on that site.
  Median (not mean) so a few mismatches or extreme SKUs don't swing it.
  Below 100 = Casinetto is cheaper on the typical shared item.
- **Price Index (weighted)** = `Σ our_price / Σ their_price × 100` over matched
  items — a "basket" view; sales-weight it later via `catalog_items.sales_ytd`.
- **Coverage %** (the 1IF aggregate) = `items_found / active_catalog × 100`.
- **Win rate %** = share of matched items where we're cheaper.

Every run appends a row per competitor to `website_metrics`, so charting the
index over time is a single `select`. The live (current) version is the view
`v_website_competitiveness`; item-level detail is `v_item_competitiveness`.

## Setup

```bash
npm install
npx playwright install chromium      # for spinneys/waitrose/carrefour/grandiose
cp .env.example .env                 # fill in Supabase URL + service role key
```

Apply the schema to Supabase (reuses your existing project, or make a new one):

```bash
supabase link --project-ref YOUR_REF
supabase db push                     # applies supabase/migrations/0001_init.sql
```
(Or paste `supabase/migrations/0001_init.sql` into the SQL editor.)

## Run

```bash
# 1. Load our catalog from a PIM / pricing export (xlsx or csv)
npm run import -- "C:/Users/Giovanni.sacca/OneDrive/Desktop/Pricing/Pricing_STD_4_23.xlsx"

# 2. Scrape competitors (all, or pick some)
npm run scrape                       # all
npm run scrape -- dolcesalato spinneys

# 3. Match our catalog to what we scraped
npm run match

# 4. Compute + snapshot the website metrics (prints a table too)
npm run metrics

# Or all steps at once:
npm run all
```

### Try it with zero setup

Proves scrape → match → metrics end-to-end against the local pricing file, no
Supabase needed:

```bash
npm run try:dolcesalato
```

## Matching & the human-in-the-loop

Grocery matching is noisy — different naming, brands, and pack sizes. The engine
(`src/lib/match.js`) scores each candidate on name overlap + pack-size agreement
(and barcode = instant match if your PIM export includes one — add the `barcode`
column and it becomes the primary key). It **auto-accepts above 0.62** and
stores weaker ones unconfirmed for review.

Because auto-matches include false positives (e.g. a coconut oil matched to an
olive oil in the first test run), the schema supports curation:

- Confirm a match: set `product_matches.is_confirmed = true`.
- Reject a wrong one: set `is_rejected = true` (it's excluded and never
  re-proposed).
- Force a match manually: insert a row with `match_method = 'manual'`.

`v_best_match` always prefers confirmed/manual/barcode over raw auto scores, so
your curation sticks across future scrape runs. **Adding barcodes to the PIM
export is the single biggest accuracy win** — it collapses the whole matching
problem to an exact join.

Tune `AUTO_ACCEPT` / `REVIEW_FLOOR` in `src/lib/match.js` if you want stricter
auto-acceptance.

## Scheduling

Wrap `npm run all` in a Windows Task Scheduler job (weekly is plenty for grocery
pricing). Each run stamps `website_metrics.computed_at`, so the trend builds
automatically.

## Files

- `supabase/migrations/0001_init.sql` — tables + metric views
- `src/lib/normalize.js` — name normalization + pack-size parsing
- `src/lib/match.js` — scoring engine
- `src/scrapers/` — one adapter per competitor (+ `base.js` extractor, `search-scraper.js` factory)
- `src/pipeline/` — `import-catalog`, `scrape`, `match`, `metrics`, `run-all`
- `scripts/try-dolcesalato.js` — offline end-to-end demo

## Known limits / next steps

- **Coverage is genuinely low on Dolce & Salato (~2%)** because our 2,300-item
  catalog is far broader than their ~250-product range. Coverage will be higher
  on the big supermarkets once their scrapers are validated.
- The 🟡 scrapers need one validation pass against the live sites (run
  `npm run scrape -- spinneys` and check the counts; adjust selectors if 0).
- Carrefour's Akamai protection may still block headless Chromium; if so, switch
  `headless: false` in `src/lib/browser.js` or add a stealth plugin.
- Add `barcode` to the PIM export to make matching near-perfect.
- Sales-weight the index using `catalog_items.sales_ytd` (already imported).
