-- Casinetto Competitor Price Intelligence — schema + metric views
-- Applies with: supabase db push   (or paste into the SQL editor)
--
-- Metric definitions (the numbers you monitor over time) live at the bottom
-- as VIEWS so the raw tables stay append-only and auditable.

-- ---------------------------------------------------------------------------
-- 1. OUR CATALOG (imported from PIM export)
-- ---------------------------------------------------------------------------
create table if not exists catalog_items (
  item_code      text primary key,           -- PIM ItemCode, e.g. HLLC501
  item_name      text not null,
  brand          text,
  category       text,
  size_value     numeric,                     -- parsed pack size, e.g. 100
  size_unit      text,                        -- g, kg, ml, l, pc
  our_price      numeric,                     -- current live retail price (AED)
  cost           numeric,
  barcode        text,                        -- EAN/UPC if PIM has it (best match key)
  sales_ytd      numeric,                     -- for sales-weighting the index
  is_active      boolean default true,
  norm_name      text,                        -- normalized name (filled by importer)
  updated_at     timestamptz default now()
);
create index if not exists idx_catalog_barcode on catalog_items(barcode) where barcode is not null;
create index if not exists idx_catalog_active   on catalog_items(is_active);

-- ---------------------------------------------------------------------------
-- 2. COMPETITORS (the six websites)
-- ---------------------------------------------------------------------------
create table if not exists competitors (
  slug        text primary key,               -- 'spinneys', 'dolcesalato', ...
  name        text not null,
  base_url    text,
  currency    text default 'AED',
  is_active   boolean default true
);

insert into competitors (slug, name, base_url) values
  ('spinneys',    'Spinneys',     'https://www.spinneys.com/en-ae/'),
  ('carrefour',   'Carrefour UAE','https://www.carrefouruae.com/mafuae/en/'),
  ('waitrose',    'Waitrose UAE', 'https://www.waitrose.ae/'),
  ('dolcesalato', 'Dolce & Salato','https://dolcesalato.ae/'),
  ('grandiose',   'Grandiose',    'https://www.grandiose.ae/'),
  ('viva',        'Viva Supermarket','https://myviva.com/')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 3. COMPETITOR PRODUCTS (latest known catalog per competitor)
--    One row per distinct competitor product we've ever seen.
-- ---------------------------------------------------------------------------
create table if not exists competitor_products (
  id              bigint generated always as identity primary key,
  competitor      text not null references competitors(slug),
  ext_id          text,                        -- competitor's own product id
  title           text not null,
  brand           text,
  size_value      numeric,
  size_unit       text,
  barcode         text,
  url             text,
  norm_name       text,
  first_seen      timestamptz default now(),
  last_seen       timestamptz default now(),
  unique (competitor, ext_id)
);
create index if not exists idx_cp_competitor on competitor_products(competitor);
create index if not exists idx_cp_barcode    on competitor_products(barcode) where barcode is not null;
create index if not exists idx_cp_norm       on competitor_products(competitor, norm_name);

-- ---------------------------------------------------------------------------
-- 4. PRICE SNAPSHOTS (append-only time series — never updated)
--    Every scrape run writes the price it observed for each product.
-- ---------------------------------------------------------------------------
create table if not exists price_snapshots (
  id                    bigint generated always as identity primary key,
  competitor_product_id bigint not null references competitor_products(id),
  competitor            text not null references competitors(slug),
  run_id                uuid not null,          -- groups a single scrape run
  price                 numeric,                -- shelf/selling price (AED)
  was_price             numeric,                -- pre-discount price if shown
  in_stock              boolean,
  scraped_at            timestamptz default now()
);
create index if not exists idx_ps_product on price_snapshots(competitor_product_id, scraped_at desc);
create index if not exists idx_ps_run     on price_snapshots(run_id);

-- ---------------------------------------------------------------------------
-- 5. PRODUCT MATCHES (our item <-> a competitor product)
--    match_method: 'barcode' | 'auto' | 'manual'. Manual overrides win.
-- ---------------------------------------------------------------------------
create table if not exists product_matches (
  id                    bigint generated always as identity primary key,
  item_code             text not null references catalog_items(item_code),
  competitor            text not null references competitors(slug),
  competitor_product_id bigint not null references competitor_products(id),
  match_method          text not null default 'auto',
  confidence            numeric,                -- 0..1 similarity score
  is_confirmed          boolean default false,  -- human-verified
  is_rejected           boolean default false,  -- human said "not a match"
  created_at            timestamptz default now(),
  unique (item_code, competitor, competitor_product_id)
);
create index if not exists idx_pm_item on product_matches(item_code);
create index if not exists idx_pm_comp on product_matches(competitor);

-- ---------------------------------------------------------------------------
-- 6. METRIC RUNS (one row per full pipeline run — headline numbers snapshot)
-- ---------------------------------------------------------------------------
create table if not exists metric_runs (
  run_id      uuid primary key,
  started_at  timestamptz default now(),
  note        text
);

-- Website-level headline metrics, snapshotted per run so you can chart trends.
create table if not exists website_metrics (
  id                bigint generated always as identity primary key,
  run_id            uuid not null references metric_runs(run_id),
  competitor        text not null references competitors(slug),
  catalog_size      int,          -- active catalog items considered
  items_found       int,          -- 1IF aggregate: how many we matched
  coverage_pct      numeric,      -- items_found / catalog_size * 100
  price_index       numeric,      -- MEDIAN of item PCR across matched items
  price_index_wtd   numeric,      -- sales-weighted basket index (Sum ours / Sum theirs)
  win_rate_pct      numeric,      -- % of matched items where we are cheaper
  median_gap_pct    numeric,      -- median (theirs-ours)/theirs*100  (+ = we're cheaper)
  computed_at       timestamptz default now(),
  unique (run_id, competitor)
);
create index if not exists idx_wm_comp on website_metrics(competitor, computed_at);

-- ===========================================================================
-- METRIC LAYER (views) — read these to see current state
-- ===========================================================================

-- Latest observed price for each competitor product.
create or replace view v_latest_price as
select distinct on (competitor_product_id)
       competitor_product_id, competitor, price, was_price, in_stock, scraped_at
from price_snapshots
order by competitor_product_id, scraped_at desc;

-- The best (confirmed > highest confidence) match per (item, competitor),
-- excluding rejected ones.
create or replace view v_best_match as
select distinct on (item_code, competitor)
       item_code, competitor, competitor_product_id, match_method, confidence, is_confirmed
from product_matches
where not is_rejected
order by item_code, competitor,
         is_confirmed desc,
         (match_method = 'manual') desc,
         (match_method = 'barcode') desc,
         confidence desc nulls last;

-- ITEM-LEVEL price competitiveness.
--   pcr = our_price / their_price * 100
--     < 100  => we are cheaper (e.g. ours 90 / theirs 100 => 90%)
--     = 100  => parity
--     > 100  => we are more expensive
--   gap_pct = (their_price - our_price)/their_price * 100  (positive = we win)
create or replace view v_item_competitiveness as
select c.item_code,
       c.item_name,
       c.category,
       c.our_price,
       m.competitor,
       cp.title           as competitor_title,
       cp.url             as competitor_url,
       lp.price           as their_price,
       m.match_method,
       m.confidence,
       round(c.our_price / nullif(lp.price,0) * 100, 1)                    as pcr,
       round((lp.price - c.our_price) / nullif(lp.price,0) * 100, 1)       as gap_pct,
       (c.our_price < lp.price)                                           as we_are_cheaper,
       c.sales_ytd
from catalog_items c
join v_best_match m       on m.item_code = c.item_code
join competitor_products cp on cp.id = m.competitor_product_id
join v_latest_price lp    on lp.competitor_product_id = m.competitor_product_id
where c.is_active
  and c.our_price is not null
  and lp.price is not null;

-- WEBSITE-LEVEL live metrics (current state; the run-snapshots in
-- website_metrics are the historical version of this).
create or replace view v_website_competitiveness as
with base as (
  select * from v_item_competitiveness
),
cat as (
  select count(*) as catalog_size from catalog_items where is_active and our_price is not null
)
select b.competitor,
       (select catalog_size from cat)                                        as catalog_size,
       count(*)                                                              as items_found,
       round(count(*)::numeric / (select catalog_size from cat) * 100, 1)   as coverage_pct,
       round(percentile_cont(0.5) within group (order by b.pcr)::numeric,1) as price_index,
       round(sum(b.our_price) / nullif(sum(b.their_price),0) * 100, 1)      as price_index_wtd,
       round(avg(case when b.we_are_cheaper then 1 else 0 end)*100,1)       as win_rate_pct,
       round(percentile_cont(0.5) within group (order by b.gap_pct)::numeric,1) as median_gap_pct
from base b
group by b.competitor;

comment on view v_website_competitiveness is
 'Headline monitor: price_index = median(our/their*100). <100 means Casinetto is cheaper on the typical matched item. coverage_pct = 1IF aggregate.';

-- BRAND-LEVEL competitiveness per competitor. Answers "how do we compare on
-- Barilla / Rummo / Ferrero at each website, and how much of each brand's range
-- does that site carry".
create or replace view v_brand_competitiveness as
with cat as (
  select coalesce(brand, 'Unbranded / other') as brand, count(*) as brand_catalog_items
  from catalog_items where is_active and our_price is not null
  group by 1
)
select b.competitor,
       c.brand,
       c.brand_catalog_items,
       count(*)                                                         as items_found,
       round(count(*)::numeric / c.brand_catalog_items * 100, 1)        as coverage_pct,
       round(percentile_cont(0.5) within group (order by b.pcr)::numeric,1) as price_index,
       round(avg(case when b.we_are_cheaper then 1 else 0 end)*100,1)   as win_rate_pct
from v_item_competitiveness b
join catalog_items ci on ci.item_code = b.item_code
join cat c on c.brand = coalesce(ci.brand,'Unbranded / other')
group by b.competitor, c.brand, c.brand_catalog_items;

-- CATEGORY-LEVEL competitiveness per competitor (Casinetto taxonomy).
create or replace view v_category_competitiveness as
with cat as (
  select coalesce(category,'Uncategorised') as category, count(*) as cat_catalog_items
  from catalog_items where is_active and our_price is not null
  group by 1
)
select b.competitor,
       coalesce(ci.category,'Uncategorised')                            as category,
       cat.cat_catalog_items,
       count(*)                                                         as items_found,
       round(count(*)::numeric / cat.cat_catalog_items * 100, 1)        as coverage_pct,
       round(percentile_cont(0.5) within group (order by b.pcr)::numeric,1) as price_index,
       round(avg(case when b.we_are_cheaper then 1 else 0 end)*100,1)   as win_rate_pct
from v_item_competitiveness b
join catalog_items ci on ci.item_code = b.item_code
join cat on cat.category = coalesce(ci.category,'Uncategorised')
group by b.competitor, ci.category, cat.cat_catalog_items;

-- CATALOG SUMMARY — headline counts for the top of the dashboard.
create or replace view v_catalog_summary as
select count(*)                                              as total_items,
       count(*) filter (where our_price is not null)         as priced_items,
       count(distinct coalesce(brand,'Unbranded / other'))   as total_brands,
       count(distinct coalesce(category,'Uncategorised'))    as total_categories
from catalog_items where is_active;
