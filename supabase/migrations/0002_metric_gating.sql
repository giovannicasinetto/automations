-- 0002: gate the headline metrics on match CONFIDENCE, and add a review queue.
--
-- Problem 0001 had: v_item_competitiveness counted every non-rejected match,
-- including weak "for review" candidates (confidence 0.40–0.62). That inflates
-- coverage and pollutes the index with likely-wrong matches. Fix: only accepted
-- matches feed the metrics; weak ones go to a separate review queue.
--
-- An accepted match = human-confirmed, or a manual/barcode match, or an auto
-- match at/above the 0.62 auto-accept threshold. Rejected matches never count.

-- Redefine the "best match" view to accepted-only (columns unchanged, so
-- dependent views v_item/website/brand/category update automatically).
create or replace view v_best_match as
select distinct on (item_code, competitor)
       item_code, competitor, competitor_product_id, match_method, confidence, is_confirmed
from product_matches
where not is_rejected
  and (is_confirmed
       or match_method in ('manual','barcode')
       or confidence >= 0.62)          -- auto-accept threshold (see src/lib/match.js)
order by item_code, competitor,
         is_confirmed desc,
         (match_method = 'manual') desc,
         (match_method = 'barcode') desc,
         confidence desc nulls last;

-- Guard the sales-weighted index against extreme outliers / data errors
-- (e.g. a mispriced item giving PCR 3771%). The median index is already robust;
-- this keeps the basket index sane too. Only items with a plausible ratio
-- (10%..200%) contribute to price_index_wtd.
create or replace view v_website_competitiveness as
with base as (select * from v_item_competitiveness),
cat as (select count(*) as catalog_size from catalog_items where is_active and our_price is not null)
select b.competitor,
       (select catalog_size from cat)                                        as catalog_size,
       count(*)                                                              as items_found,
       round(count(*)::numeric / (select catalog_size from cat) * 100, 1)   as coverage_pct,
       round(percentile_cont(0.5) within group (order by b.pcr)::numeric,1) as price_index,
       round(sum(b.our_price) filter (where b.pcr between 10 and 200)
             / nullif(sum(b.their_price) filter (where b.pcr between 10 and 200),0) * 100, 1) as price_index_wtd,
       round(avg(case when b.we_are_cheaper then 1 else 0 end)*100,1)       as win_rate_pct,
       round(percentile_cont(0.5) within group (order by b.gap_pct)::numeric,1) as median_gap_pct
from base b
group by b.competitor;

-- Review queue: candidates that are neither accepted nor rejected — what a
-- human (or the LLM adjudicator) should rule on. Powers the "Review" screen.
create or replace view v_match_review as
select pm.item_code, ci.item_name, ci.our_price,
       pm.competitor, cp.title as competitor_title, cp.url,
       lp.price as their_price, pm.confidence,
       round(ci.our_price / nullif(lp.price,0) * 100,1) as pcr
from product_matches pm
join catalog_items ci on ci.item_code = pm.item_code
join competitor_products cp on cp.id = pm.competitor_product_id
left join v_latest_price lp on lp.competitor_product_id = pm.competitor_product_id
where not pm.is_rejected and not pm.is_confirmed
  and pm.match_method = 'auto'
  and (pm.confidence < 0.62 or ci.our_price / nullif(lp.price,0) * 100 > 200
                            or ci.our_price / nullif(lp.price,0) * 100 < 10)
order by pm.competitor, pm.confidence desc;
