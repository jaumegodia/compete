-- Promociones comunicadas en la home de cada web (topbar, banners, hero): una fila por web y día
create table public.site_promotions (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  captured_on date not null default current_date,
  captured_at timestamptz not null default now(),
  page_url text not null,
  main_discount_pct numeric(5,2),     -- descuento principal anunciado (el mayor de los bloques de promoción)
  up_to boolean not null default false, -- "hasta un X%"
  codes text[] not null default '{}',
  campaigns text[] not null default '{}',
  free_shipping boolean not null default false,
  messages jsonb not null default '[]',
  unique (site_id, captured_on)
);
create index on public.site_promotions (site_id, captured_on desc);
alter table public.site_promotions enable row level security;

-- Nuevo tipo de evento: cambio en la promoción comunicada
alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check check (type in (
  'new_product','removed_product','price_change','discount_start','discount_end',
  'out_of_stock','back_in_stock','promo_change'));
