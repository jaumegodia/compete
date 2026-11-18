-- Panel (MVP): marca propia, último precio en la variante y vistas de lectura

alter table public.brands add column is_own boolean not null default false;
update public.brands set is_own = true where id in (select brand_id from public.brand_competitors);

-- Último precio conocido de cada variante (lo actualiza el scraper) para no recorrer el histórico al leer
alter table public.variants
  add column current_price numeric(12,2),
  add column current_compare_at_price numeric(12,2),
  add column current_available boolean,
  add column current_captured_on date,
  add column size text generated always as (
    nullif(
      coalesce(substring(lower(coalesce(title, '') || ' ' || coalesce(options::text, '')) from '(\d{2,3})\s*[x×]\s*\d{2,3}'), '')
      || 'x' ||
      coalesce(substring(lower(coalesce(title, '') || ' ' || coalesce(options::text, '')) from '\d{2,3}\s*[x×]\s*(\d{2,3})'), ''),
      'x')
  ) stored;

update public.variants v set
  current_price = ps.price, current_compare_at_price = ps.compare_at_price,
  current_available = ps.available, current_captured_on = ps.captured_on
from (
  select distinct on (variant_id) variant_id, price, compare_at_price, available, captured_on
  from public.price_snapshots order by variant_id, captured_on desc
) ps where ps.variant_id = v.id;

create index on public.variants (size);

-- Resumen por producto (precios actuales de sus variantes activas)
create view public.v_product_summary with (security_invoker = true) as
select
  p.id, p.site_id, s.brand_id, b.name as brand, b.is_own, p.title, p.url, p.category, p.image_url,
  p.rating, p.review_count, p.first_seen_at, p.last_seen_at, p.removed_at,
  max(v.current_captured_on) as captured_on,
  count(v.id) as variants,
  min(v.current_price) as min_price,
  max(v.current_price) as max_price,
  count(v.id) filter (where v.current_compare_at_price is not null) as discounted_variants,
  max(round(100 * (v.current_compare_at_price - v.current_price) / nullif(v.current_compare_at_price, 0), 1)) as max_discount_pct,
  count(v.id) filter (where v.current_available = false) as out_of_stock_variants
from public.products p
join public.sites s on s.id = p.site_id
join public.brands b on b.id = s.brand_id
left join public.variants v on v.product_id = p.id and v.removed_at is null
group by p.id, s.brand_id, b.name, b.is_own;

-- Resumen por marca: catálogo actual, última promoción de la home y última captura
create view public.v_brand_summary with (security_invoker = true) as
with cat as (
  select brand_id, count(*) as products, sum(variants) as variants, sum(discounted_variants) as discounted_variants,
         sum(out_of_stock_variants) as out_of_stock_variants, round(avg(rating), 2) as avg_rating, sum(review_count) as reviews
  from public.v_product_summary where removed_at is null group by brand_id
)
select
  b.id, b.name, b.is_own, b.created_at,
  (select count(*) from public.sites s where s.brand_id = b.id) as sites,
  (select count(*) from public.sites s where s.brand_id = b.id and s.active) as active_sites,
  coalesce(cat.products, 0) as products, coalesce(cat.variants, 0) as variants,
  coalesce(cat.discounted_variants, 0) as discounted_variants, coalesce(cat.out_of_stock_variants, 0) as out_of_stock_variants,
  cat.avg_rating, cat.reviews,
  promo.captured_on as promo_date, promo.main_discount_pct, promo.up_to, promo.campaigns, promo.codes, promo.free_shipping,
  run.started_at as last_run_at, run.status as last_run_status
from public.brands b
left join cat on cat.brand_id = b.id
left join lateral (
  select sp.* from public.site_promotions sp join public.sites s on s.id = sp.site_id
  where s.brand_id = b.id order by sp.captured_on desc limit 1
) promo on true
left join lateral (
  select r.* from public.scrape_runs r join public.sites s on s.id = r.site_id
  where s.brand_id = b.id order by r.started_at desc limit 1
) run on true;
