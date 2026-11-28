-- Tipo de producto común a todos los sectores (taxonomía en web/lib/taxonomy.ts).
-- Lo calcula scrapers/src/classify.ts: reglas y, si no encajan, IA. Se puede corregir a mano (source = 'manual').
alter table public.products
  add column product_type text,
  add column product_type_source text check (product_type_source in ('rules', 'ai', 'manual', 'fallback')),
  add column product_type_at timestamptz;

create index on public.products (product_type);
-- Pendientes de clasificar
create index products_unclassified_idx on public.products (site_id) where product_type is null;

-- La vista del panel expone el tipo (columna añadida al final: no cambia las demás)
create or replace view public.v_product_summary with (security_invoker = true) as
select
  p.id, p.site_id, s.brand_id, b.name as brand, b.is_own, p.title, p.url, p.category, p.image_url,
  p.rating, p.review_count, p.first_seen_at, p.last_seen_at, p.removed_at,
  max(v.current_captured_on) as captured_on,
  count(v.id) as variants,
  min(v.current_price) as min_price,
  max(v.current_price) as max_price,
  count(v.id) filter (where v.current_compare_at_price is not null) as discounted_variants,
  max(round(100 * (v.current_compare_at_price - v.current_price) / nullif(v.current_compare_at_price, 0), 1)) as max_discount_pct,
  count(v.id) filter (where v.current_available = false) as out_of_stock_variants,
  p.product_type
from public.products p
join public.sites s on s.id = p.site_id
join public.brands b on b.id = s.brand_id
left join public.variants v on v.product_id = p.id and v.removed_at is null
group by p.id, s.brand_id, b.name, b.is_own;

-- Sectores de los proyectos que siguen cada web (para clasificar con los tipos adecuados)
create or replace view public.v_site_verticals with (security_invoker = on) as
select s.id as site_id, array_agg(distinct p.vertical) filter (where p.vertical is not null) as verticals
from public.sites s
join (
  select own_brand_id as brand_id, id as project_id from public.projects
  union
  select brand_id, project_id from public.project_competitors
) t on t.brand_id = s.brand_id
join public.projects p on p.id = t.project_id
group by s.id;
