-- Piloto: Marmota y sus tres competidores (webs propias)
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
)
insert into public.brand_competitors (brand_id, competitor_id)
select m.id, c.id from b m, b c where m.name = 'Marmota' and c.name <> 'Marmota';
