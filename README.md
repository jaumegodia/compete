# COMPETE

Inteligencia competitiva para e-commerce: catálogo, precios y promociones de tu marca frente a tus competidores.

Este repositorio contiene, de momento, la **captura diaria de catálogos** de las webs propias de cada marca y el esquema de base de datos en Supabase. El frontend (Next.js + Supabase) vendrá después.

## Cómo funciona la captura

```
GitHub Actions (cada día 04:17 UTC)
  └─ npm run scrape
       ├─ lee las webs activas de la tabla `sites`
       ├─ detecta la plataforma de cada web y usa su adaptador
       ├─ guarda productos, variantes y el precio del día
       └─ compara con el último precio guardado y crea `events`
```

### Adaptadores

| Plataforma | Cómo se lee | Fiabilidad |
|---|---|---|
| **Shopify** | Endpoint público `/products.json` (paginado de 250 en 250) | Muy alta: catálogo completo, variantes, precio tachado y stock |
| **WooCommerce** | Store API pública `/wp-json/wc/store/v1/products` | Alta: los productos variables piden cada variación aparte |
| **Genérico** | `robots.txt` → sitemaps → cada ficha → datos schema.org (JSON-LD `Product` / `ProductGroup`) | Media: depende de que la web publique bien sus datos estructurados (la mayoría lo hace para Google Shopping) |

Si una web tiene `platform = 'auto'`, se detecta en cada ejecución probando primero Shopify, luego WooCommerce y, si no, el genérico. Cuando se detecta Shopify o WooCommerce se guarda para no repetir la detección.

Si el genérico no encuentra productos, la ejecución queda en `scrape_runs` con estado `error` y el aviso de que hace falta un adaptador a medida (`scrapers/src/adapters/`).

### Eventos que se detectan

`new_product`, `removed_product`, `price_change`, `discount_start`, `discount_end`, `out_of_stock`, `back_in_stock`.

- La primera captura de una web no genera eventos: solo crea el punto de partida.
- Si una captura trae menos de la mitad de los productos activos (bloqueo, caída de la web…), **no** se marca nada como retirado y queda un aviso en `scrape_runs`.

## Base de datos (Supabase)

Migraciones en `supabase/migrations/`, datos del piloto en `supabase/seed.sql`.

| Tabla | Contenido |
|---|---|
| `brands`, `brand_competitors` | Marcas y quién compite con quién |
| `sites` | Webs a capturar (`platform`: auto, shopify, woocommerce, generic) |
| `products`, `variants` | Catálogo, con `first_seen_at`, `last_seen_at` y `removed_at` |
| `price_snapshots` | Un registro diario por variante: precio, precio tachado y disponibilidad |
| `scrape_runs` | Cada ejecución: estado, nº de productos, errores |
| `events` | Cambios detectados (alimentan alertas y resumen semanal) |

RLS está activado en todas las tablas y todavía sin políticas: solo el scraper (con la clave `service_role`) puede leer y escribir. Las políticas para usuarios se añadirán con el frontend.

## Puesta en marcha

1. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - `SUPABASE_URL` = `https://ltddtuycbonkgwaxsfgm.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = la clave secreta de Supabase (*Project Settings → API Keys*)
2. **Actions → Captura diaria de catálogos → Run workflow**
   - `dry`: prueba las 4 webs sin tocar la base de datos y deja el resultado como artefacto `capturas`.
   - `full`: captura y guarda en Supabase.

### En local

```bash
npm install
cp .env.example .env   # y rellena la clave
npm test
npm run scrape:dry -- --url https://www.dormideo.com   # prueba sin base de datos → out/
npm run scrape -- --site dormideo                      # captura y guarda solo Dormideo
```

Variables opcionales: `MAX_PRODUCTS` (límite por web, 2000 por defecto) y `DELAY_MS` (pausa entre peticiones, 500 ms).

## Añadir una web

```sql
insert into sites (brand_id, base_url) values ('<id de la marca>', 'https://www.ejemplo.com');
```

## Buenas prácticas de captura

- Una sola petición a la vez por web, con pausa entre peticiones y reintentos con espera ante errores 429/5xx.
- Solo datos públicos de catálogo; nada de datos personales.
- User-Agent identificable (`CompeteBot`), configurable con `SCRAPER_USER_AGENT`.
