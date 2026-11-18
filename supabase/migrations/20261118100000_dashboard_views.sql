-- Panel (MVP): marca propia y primera versión de las vistas de lectura (aplicada el 18 nov 2026).
-- La migración 20261118110000 las sustituye por versiones más rápidas.

alter table public.brands add column is_own boolean not null default false;
update public.brands set is_own = true where id in (select brand_id from public.brand_competitors);

create view public.v_variant_current with (security_invoker = true) as
with last as (
  select v.product_id, max(ps.captured_on) as d
  from public.variants v join public.price_snapshots ps on ps.variant_id = v.id
  group by v.product_id
)
select
  v.id as variant_id, v.product_id, p.site_id, s.brand_id, b.name as brand, b.is_own,
  p.title as product_title, p.category, p.url, v.title as variant_title, v.sku, v.options,
  nullif(
    substring(lower(coalesce(v.title, '') || ' ' || coalesce(v.options::text, '')) from '(\d{2,3})\s*[x×]\s*\d{2,3}')
    || 'x' ||
    substring(lower(coalesce(v.title, '') || ' ' || coalesce(v.options::text, '')) from '\d{2,3}\s*[x×]\s*(\d{2,3})'),
    'x') as size,
  ps.captured_on, ps.price, ps.compare_at_price, ps.available, ps.currency
from public.variants v
join public.products p on p.id = v.product_id and p.removed_at is null
join public.sites s on s.id = p.site_id
join public.brands b on b.id = s.brand_id
join last l on l.product_id = p.id
join public.price_snapshots ps on ps.variant_id = v.id and ps.captured_on = l.d
where v.removed_at is null;

create view public.v_product_summary with (security_invoker = true) as
select
  p.id, p.site_id, s.brand_id, b.name as brand, b.is_own, p.title, p.url, p.category, p.image_url,
  p.rating, p.review_count, p.first_seen_at, p.last_seen_at, p.removed_at,
  max(vc.captured_on) as captured_on,
  count(vc.variant_id) as variants,
  min(vc.price) as min_price,
  max(vc.price) as max_price,
  count(*) filter (where vc.compare_at_price is not null) as discounted_variants,
  max(round(100 * (vc.compare_at_price - vc.price) / nullif(vc.compare_at_price, 0), 1)) as max_discount_pct,
  count(*) filter (where vc.available = false) as out_of_stock_variants
from public.products p
join public.sites s on s.id = p.site_id
join public.brands b on b.id = s.brand_id
left join public.v_variant_current vc on vc.product_id = p.id
group by p.id, s.brand_id, b.name, b.is_own;

create view public.v_brand_summary with (security_invoker = true) as
select
  b.id, b.name, b.is_own, b.created_at,
  (select count(*) from public.sites s where s.brand_id = b.id) as sites,
  (select count(*) from public.sites s where s.brand_id = b.id and s.active) as active_sites,
  (select count(*) from public.v_product_summary ps where ps.brand_id = b.id and ps.removed_at is null) as products,
  (select coalesce(sum(variants), 0) from public.v_product_summary ps where ps.brand_id = b.id and ps.removed_at is null) as variants,
  (select coalesce(sum(discounted_variants), 0) from public.v_product_summary ps where ps.brand_id = b.id and ps.removed_at is null) as discounted_variants,
  (select coalesce(sum(out_of_stock_variants), 0) from public.v_product_summary ps where ps.brand_id = b.id and ps.removed_at is null) as out_of_stock_variants,
  (select round(avg(rating), 2) from public.products p join public.sites s on s.id = p.site_id where s.brand_id = b.id and p.removed_at is null) as avg_rating,
  (select sum(review_count) from public.products p join public.sites s on s.id = p.site_id where s.brand_id = b.id and p.removed_at is null) as reviews,
  promo.captured_on as promo_date, promo.main_discount_pct, promo.up_to, promo.campaigns, promo.codes, promo.free_shipping,
  run.started_at as last_run_at, run.status as last_run_status
from public.brands b
left join lateral (
  select sp.* from public.site_promotions sp join public.sites s on s.id = sp.site_id
  where s.brand_id = b.id order by sp.captured_on desc limit 1
) promo on true
left join lateral (
  select r.* from public.scrape_runs r join public.sites s on s.id = r.site_id
  where s.brand_id = b.id order by r.started_at desc limit 1
) run on true;
