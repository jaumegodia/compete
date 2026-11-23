-- Actividad publicitaria (Google Ads Transparency vía DataForSEO)
alter table public.sites add column ads_domain text; -- null = dominio de base_url sin www

create table public.ads (
  site_id uuid not null references public.sites(id) on delete cascade,
  platform text not null check (platform in ('google','meta')),
  creative_id text not null,
  advertiser_id text,
  advertiser_name text,
  format text,                     -- text | image | video
  url text,                        -- ficha del anuncio en el centro de transparencia
  preview_url text,
  first_shown timestamptz,         -- primera vez que se mostró (según la plataforma)
  last_shown timestamptz,          -- última vez que se mostró
  first_seen_at timestamptz not null default now(),  -- primera vez que lo vimos nosotros
  last_seen_at timestamptz not null default now(),
  primary key (site_id, platform, creative_id)
);
create index ads_site_first_shown on public.ads (site_id, first_shown desc);
create index ads_site_last_shown on public.ads (site_id, last_shown desc);

create table public.ad_snapshots (
  site_id uuid not null references public.sites(id) on delete cascade,
  platform text not null check (platform in ('google','meta')),
  captured_on date not null,
  ads_total integer,               -- anuncios devueltos por la plataforma
  ads_active integer,              -- mostrados en los últimos 7 días
  ads_new_7d integer,              -- con primera aparición en los últimos 7 días
  by_format jsonb,                 -- anuncios activos por formato
  advertisers jsonb,               -- [{id, name}]
  primary key (site_id, platform, captured_on)
);

alter table public.ads enable row level security;
alter table public.ad_snapshots enable row level security;
