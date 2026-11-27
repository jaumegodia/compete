-- Piloto: proyecto Marmota con sus tres competidores (webs propias)
with b as (
  insert into public.brands (name) values ('Marmota'),('Emma'),('Flex'),('Dormideo') returning id, name
), s as (
  insert into public.sites (brand_id, base_url, platform)
  select id, case name
    when 'Marmota' then 'https://comounamarmota.com'
    when 'Emma' then 'https://www.emma-colchon.es'
    when 'Flex' then 'https://flex.es'
    when 'Dormideo' then 'https://www.dormideo.com' end,
    case name when 'Dormideo' then 'shopify' else 'auto' end
  from b returning brand_id
), p as (
  insert into public.projects (slug, name, own_brand_id)
  select 'marmota', 'Marmota', id from b where name = 'Marmota' returning id
)
insert into public.project_competitors (project_id, brand_id)
select p.id, b.id from p, b where b.name <> 'Marmota';
