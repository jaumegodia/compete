alter table public.sites add column ads_advertiser_ids text[]; -- null = el anunciante con más anuncios para el dominio
alter table public.ads add column own boolean not null default true; -- false = anuncio de un tercero que enlaza a la web
alter table public.ad_snapshots add column third_party_active integer, add column third_party jsonb;
comment on column public.ad_snapshots.ads_total is 'anuncios propios devueltos por la plataforma';
