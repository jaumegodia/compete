-- COMPETE · esquema de catálogo (MVP: catálogos de las webs propias de cada marca)

-- Marcas (propias o competidoras; una misma marca puede ser competidora de varias)
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) on delete set null, -- usuario que la gestiona como marca propia (null = solo competidora)
  created_at timestamptz not null default now()
);

-- Relación marca -> competidores
create table public.brand_competitors (
  brand_id uuid not null references public.brands(id) on delete cascade,
  competitor_id uuid not null references public.brands(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (brand_id, competitor_id),
  check (brand_id <> competitor_id)
);

-- Webs que se capturan (de momento, la web propia de cada marca)
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  base_url text not null unique,
  platform text not null default 'auto' check (platform in ('auto','shopify','woocommerce','generic')),
  currency text not null default 'EUR',
  active boolean not null default true,
  last_scraped_at timestamptz,
  created_at timestamptz not null default now()
);

-- Productos
create table public.products (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  external_id text not null,          -- id de la plataforma o URL canónica
  url text not null,
  title text not null,
  category text,
  vendor text,
  image_url text,
  description text,
  raw jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,              -- null = sigue en el catálogo
  unique (site_id, external_id)
);

-- Variantes (medidas, colores…)
create table public.variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  external_id text not null,
  title text,
  sku text,
  options jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (product_id, external_id)
);

-- Precio y disponibilidad diarios por variante
create table public.price_snapshots (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.variants(id) on delete cascade,
  captured_on date not null default current_date,
  price numeric(12,2),
  compare_at_price numeric(12,2),     -- precio tachado
  currency text not null default 'EUR',
  available boolean,
  captured_at timestamptz not null default now(),
  unique (variant_id, captured_on)
);

-- Ejecuciones del scraper
create table public.scrape_runs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','ok','error')),
  platform text,
  products_found int,
  variants_found int,
  events_created int,
  error text
);

-- Cambios detectados (alimentan alertas y resumen semanal)
create table public.events (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  run_id uuid references public.scrape_runs(id) on delete set null,
  product_id uuid references public.products(id) on delete cascade,
  variant_id uuid references public.variants(id) on delete cascade,
  type text not null check (type in ('new_product','removed_product','price_change','discount_start','discount_end','out_of_stock','back_in_stock')),
  old_value jsonb,
  new_value jsonb,
  detected_at timestamptz not null default now()
);

create index on public.products (site_id) where removed_at is null;
create index on public.variants (product_id);
create index on public.price_snapshots (variant_id, captured_on desc);
create index on public.events (site_id, detected_at desc);
create index on public.events (product_id);
create index on public.events (variant_id);
create index on public.events (run_id);
create index on public.scrape_runs (site_id, started_at desc);
create index on public.sites (brand_id);
create index on public.brands (owner_id);
create index on public.brand_competitors (competitor_id);

-- RLS activado en todo. Sin políticas de momento: solo el scraper (service role) lee y escribe.
-- Las políticas para usuarios se añadirán con el frontend.
alter table public.brands enable row level security;
alter table public.brand_competitors enable row level security;
alter table public.sites enable row level security;
alter table public.products enable row level security;
alter table public.variants enable row level security;
alter table public.price_snapshots enable row level security;
alter table public.scrape_runs enable row level security;
alter table public.events enable row level security;
