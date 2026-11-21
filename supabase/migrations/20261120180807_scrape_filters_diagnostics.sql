-- Filtro de fichas por web y diagnóstico de cada ejecución del scraper

-- Expresiones regulares (sin distinguir mayúsculas) que se comparan con la ruta de cada URL del sitemap.
-- Si hay alguna, solo se visitan las URLs que encajan con al menos una. null o vacío = todas.
alter table public.sites add column include_url_patterns text[];

-- Datos de la ejecución: código HTTP de robots.txt y de cada sitemap, nº de sitemaps hijos,
-- URLs encontradas y tras filtrar, páginas visitadas, bloqueos anti-bots…
alter table public.scrape_runs add column diagnostics jsonb;
