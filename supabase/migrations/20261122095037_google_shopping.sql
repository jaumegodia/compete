-- Fuente Google Shopping (vía DataForSEO) para webs que bloquean la captura directa

alter table public.sites drop constraint sites_platform_check;
alter table public.sites add constraint sites_platform_check
  check (platform in ('auto','shopify','woocommerce','generic','google_shopping'));

-- Configuración propia de cada web. Para google_shopping:
--   {"seller": "Maxcolchon ES", "brand": "Maxcolchon", "queries": ["maxcolchón", "maxcolchon colchon"],
--    "discoverModels": true, "maxQueries": 60}
alter table public.sites add column scrape_config jsonb;
