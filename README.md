# COMPETE

Inteligencia competitiva para e-commerce: catálogo, precios y promociones de tu marca frente a tus competidores.

Este repositorio contiene la **captura diaria de catálogos y promociones** de las webs de cada marca (`scrapers/`), el esquema de base de datos en Supabase (`supabase/`) y el **panel** para gestionarlo y ver los resultados (`web/`, ver [web/README.md](web/README.md)).

## Cómo funciona la captura

```
GitHub Actions (cada día 04:17 UTC, con respaldo a las 09:47 UTC)
  └─ npm run scrape
       ├─ lee las webs activas de la tabla `sites`
       ├─ detecta la plataforma de cada web y usa su adaptador
       ├─ guarda productos, variantes y el precio del día
       ├─ compara con el último precio guardado y crea `events`
       └─ lee las promociones de la home y las guarda en `site_promotions`
```

### Adaptadores

| Plataforma | Cómo se lee | Fiabilidad |
|---|---|---|
| **Shopify** | Endpoint público `/products.json` (paginado de 250 en 250). Si la tienda lo bloquea: URLs `/products/…` del sitemap y `/products/{handle}.js` por ficha | Muy alta: catálogo completo, variantes, precio tachado y stock |
| **WooCommerce** | Store API pública `/wp-json/wc/store/v1/products` | Alta: los productos variables piden cada variación aparte |
| **Genérico** | `robots.txt` → sitemaps → cada ficha → datos schema.org (JSON-LD `Product` / `ProductGroup`) | Media: depende de que la web publique bien sus datos estructurados (la mayoría lo hace para Google Shopping) |

En el adaptador genérico, la categoría sale de los datos del producto, de las migas de pan o del primer tramo de la URL. Las páginas de packs o landings que repiten los SKU de otro producto se descartan y se conserva la ficha principal.

Si una web tiene `platform = 'auto'`, se detecta en cada ejecución probando primero Shopify, luego WooCommerce y, si no, el genérico. Cuando se detecta Shopify o WooCommerce se guarda para no repetir la detección.

Si el genérico no encuentra productos, la ejecución queda en `scrape_runs` con estado `error` y el aviso de que hace falta un adaptador a medida (`scrapers/src/adapters/`).

### Promociones de la home

Con la Directiva Ómnibus muchas marcas no publican precios tachados, pero sí anuncian su descuento en la home. Cada día se lee la home de cada web y se guarda en `site_promotions`:

- los mensajes de las barras de anuncio, topbars, banners, cabecera y titulares del hero;
- el **descuento principal** (el mayor % de los bloques de promoción, indicando si es "hasta"), los **códigos**, las **campañas** (Black Friday, Rebajas…) y si hay **envío gratis**.

Se descartan los porcentajes de financiación ("0% TAE") y de composición ("100% algodón"). Si la topbar se pinta con JavaScript, se buscan los textos en los datos de la página. Cuando cambia la promoción respecto a la captura anterior se crea un evento `promo_change`.

### Eventos que se detectan

`new_product`, `removed_product`, `price_change`, `discount_start`, `discount_end`, `out_of_stock`, `back_in_stock`, `promo_change`.

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
| `site_promotions` | Promoción comunicada en la home cada día: descuento principal, códigos, campañas, envío gratis y mensajes |
| `events` | Cambios detectados (alimentan alertas y resumen semanal) |

RLS está activado en todas las tablas y todavía sin políticas: solo el scraper (con la clave `service_role`) puede leer y escribir. Las políticas para usuarios se añadirán con el frontend.

## Puesta en marcha

1. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - `SUPABASE_URL` = `https://ltddtuycbonkgwaxsfgm.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = la clave secreta de Supabase (*Project Settings → API Keys*)
2. **Actions → Captura diaria de catálogos → Run workflow**
   - `dry`: prueba las 4 webs sin tocar la base de datos y deja el resultado como artefacto `capturas`.
   - `full`: captura y guarda en Supabase.
   - `promos`: prueba solo las promociones de la home, sin tocar la base de datos.

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
