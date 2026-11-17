-- Último snapshot de precio de cada variante de una web (lo usa el scraper para detectar cambios)
create or replace function public.latest_snapshots(p_site_id uuid)
returns table (variant_id uuid, captured_on date, price numeric, compare_at_price numeric, available boolean)
language sql stable
set search_path = ''
as $$
  select distinct on (ps.variant_id) ps.variant_id, ps.captured_on, ps.price, ps.compare_at_price, ps.available
  from public.price_snapshots ps
  join public.variants v on v.id = ps.variant_id
  join public.products p on p.id = v.product_id
  where p.site_id = p_site_id
  order by ps.variant_id, ps.captured_on desc
$$;
revoke execute on function public.latest_snapshots(uuid) from public, anon, authenticated;
