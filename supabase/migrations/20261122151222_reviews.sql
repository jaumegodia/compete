-- Reseñas (DataForSEO Business Data API). De momento, Trustpilot.
alter table public.sites add column trustpilot_domain text; -- null = dominio de base_url sin www

create table public.review_snapshots (
  site_id uuid not null references public.sites(id) on delete cascade,
  source text not null check (source in ('trustpilot','google')),
  captured_on date not null,
  rating numeric,              -- nota global (sobre 5)
  reviews_count integer,       -- reseñas totales del perfil
  profile_url text,
  primary key (site_id, source, captured_on)
);

create table public.reviews (
  site_id uuid not null references public.sites(id) on delete cascade,
  source text not null check (source in ('trustpilot','google')),
  review_id text not null,     -- id de la fuente o hash estable (fecha + autor + texto)
  rating numeric,
  title text,
  body text,
  author text,
  language text,
  published_at timestamptz,
  replied boolean not null default false,
  url text,
  first_seen_at timestamptz not null default now(),
  primary key (site_id, source, review_id)
);
create index reviews_site_published on public.reviews (site_id, published_at desc);

alter table public.review_snapshots enable row level security;
alter table public.reviews enable row level security;
