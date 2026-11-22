-- Tráfico y SEO por dominio (DataForSEO Labs, Google España)

-- Una fila por web y mes: tráfico orgánico y de pago estimados, keywords y distribución de posiciones.
-- historical_rank_overview devuelve el histórico mensual completo; cada ejecución reescribe los meses que trae.
create table public.domain_metrics (
  site_id uuid not null references public.sites(id) on delete cascade,
  month date not null,                    -- primer día del mes
  organic_etv numeric,                    -- visitas orgánicas estimadas al mes
  organic_keywords integer,               -- keywords en el top 100
  organic_pos_1 integer,
  organic_pos_2_3 integer,
  organic_pos_4_10 integer,
  organic_pos_11_100 integer,
  organic_traffic_value numeric,          -- lo que costaría ese tráfico en Google Ads (USD)
  organic_new integer,
  organic_lost integer,
  paid_etv numeric,                       -- visitas de pago estimadas al mes
  paid_keywords integer,
  paid_traffic_cost numeric,              -- gasto estimado en Google Ads (USD)
  raw jsonb,
  fetched_at timestamptz not null default now(),
  primary key (site_id, month)
);

-- Keywords orgánicas que más tráfico llevan a cada web (top N por tráfico estimado), una foto por ejecución.
create table public.domain_keywords (
  site_id uuid not null references public.sites(id) on delete cascade,
  captured_on date not null,
  keyword text not null,
  position integer,
  search_volume integer,
  etv numeric,                            -- visitas estimadas al mes por esta keyword
  cpc numeric,
  url text,
  primary key (site_id, captured_on, keyword)
);
create index domain_keywords_site_date on public.domain_keywords (site_id, captured_on desc);

alter table public.domain_metrics enable row level security;
alter table public.domain_keywords enable row level security;
