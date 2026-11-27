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
| **Google Shopping** | Resultados de Google Shopping España del vendedor, vía la API de DataForSEO. Para webs que bloquean la captura directa (Cloudflare…) | Media-alta: precio y precio tachado por medida tal como la tienda los envía a Google. Sin URL de la ficha ni stock |

En el adaptador genérico:

- **Sitemaps**: se toleran prólogos rotos (`<?phpxml …?>`) y comentarios. En un índice se siguen primero los hijos de producto (`product`, `producto`…) y solo si no dan URLs se miran los demás. Las URLs con pinta de ficha (`/products/…`, `/producto/…`, `…-p-123`, `/123-x.html`) se visitan antes que el resto.
- **Filtro por web**: `sites.include_url_patterns` es una lista de expresiones regulares (sin distinguir mayúsculas) que se comparan con la ruta de cada URL. Si hay alguna, solo se visitan las fichas que encajan. Por ejemplo, Maxcolchón tiene `^/colchon[^/]*-c-\d+/` para quedarse con los colchones.

  | Web | `include_url_patterns` | Para qué |
  |---|---|---|
  | Maxcolchón | `^/colchon[^/]*-c-\d+/` | Solo colchones (la web vende también sábanas, bases, cabeceros…) |
  | Emma | `^/(colchones\|almohadas[^/]*\|camas\|toppers\|complementos\|packs-ahorro)/[^/]+` | Todo el catálogo, sin blog ni landings: la captura pasa de 761 a 640 páginas y de ~23 a ~14 min |

  Se cambia con `update sites set include_url_patterns = array['…'] where base_url = '…';`. Antes de poner un filtro, comprueba que encaja con las URLs de los productos ya guardados (`select url from products where site_id = …`): si una ficha deja de pasar el filtro, se marcará como retirada.
- **JSON-LD**: solo cuentan los bloques cuyo `@type` es o incluye `Product`/`ProductGroup` (se ignoran los `ImageObject` de productos relacionados). Con un `AggregateOffer` sin precio por medida se guarda una variante «Desde» con `lowPrice`, y `lowPrice`/`highPrice` quedan en `products.raw.priceRange`. `highPrice` nunca se toma como precio tachado. `aggregateRating` va a `products.rating` y `products.review_count`.
- La categoría sale de los datos del producto, de las migas de pan o del primer tramo de la URL. Las páginas de packs o landings que repiten los SKU de otro producto se descartan y se conserva la ficha principal.

### Google Shopping (webs bloqueadas)

Cuando una web bloquea al scraper (p. ej. Maxcolchón, detrás de Cloudflare), se puede seguir su catálogo a través de Google Shopping: la mayoría de tiendas envían allí su feed con el precio de cada medida.

```sql
update sites set platform = 'google_shopping', scrape_config = '{
  "seller": "Maxcolchon ES",
  "brand": "Maxcolchon",
  "queries": ["maxcolchón", "maxcolchon colchon", "maxcolchon pack colchon"],
  "maxQueries": 60
}' where base_url = 'https://www.maxcolchon.com';
```

- `seller`: nombre exacto del vendedor en Google Shopping. Solo se guardan sus resultados.
- `brand`: se quita del principio de los títulos ("Maxcolchon Colchón Everest" → "Colchón Everest").
- `queries`: búsquedas de partida para descubrir los modelos. Después se lanza una búsqueda por modelo ("Maxcolchon Colchón Intense"), que devuelve todas sus medidas (`"discoverModels": false` lo desactiva).
- `maxQueries`: límite de búsquedas por captura. Cada búsqueda cuesta unos 0,002 $ (prioridad alta), así que 60 búsquedas diarias son unos 4 $ al mes.

Cada modelo es un producto (`external_id` = `gshop:<modelo>`) y cada medida una variante con precio y precio tachado. Si el modelo solo aparece sin medida, se guarda el precio que Google destaca. La disponibilidad queda vacía (Shopping no la da), y como los resultados varían de un día a otro, un modelo o medida solo se da por retirado tras **3 días** sin verse.

Hace falta una cuenta de DataForSEO (*API Access*: login y password) en los secretos `DATAFORSEO_LOGIN` y `DATAFORSEO_PASSWORD` de GitHub Actions.

Prueba sin base de datos:

```bash
npm run scrape:dry -- --url https://www.maxcolchon.com --platform google_shopping --config '{"seller":"Maxcolchon ES","brand":"Maxcolchon"}'
```

Si una web tiene `platform = 'auto'`, se detecta en cada ejecución probando primero Shopify, luego WooCommerce y, si no, el genérico. Cuando se detecta Shopify o WooCommerce se guarda para no repetir la detección.

Cada ejecución guarda en `scrape_runs.diagnostics` el código HTTP de `robots.txt` y de cada sitemap, el nº de sitemaps hijos, las URLs encontradas y tras filtrar, y las páginas visitadas. Si el genérico no encuentra productos, la ejecución queda con estado `error` y un motivo concreto:

| Mensaje | Qué pasa |
|---|---|
| *Web bloqueada por protección anti-bots (Cloudflare…)* | Los sitemaps devuelven un desafío anti-bots (403). No se arregla con un adaptador: hace falta otra fuente de datos (feed, Google Shopping…) |
| *0 URLs de ficha en el sitemap* | No hay sitemap o está vacío |
| *0 URLs de ficha en el sitemap tras filtrar* | Hay URLs, pero ninguna pasa `include_url_patterns` o las exclusiones |
| *Fichas sin JSON-LD Product* | Las fichas no publican datos schema.org: hará falta un adaptador a medida (`scrapers/src/adapters/`) |

### Tráfico y SEO (DataForSEO Labs)

`npm run seo` consulta DataForSEO Labs (Google España) para el dominio de cada web activa, también las que se siguen por Google Shopping:

- `historical_rank_overview` → `domain_metrics`: una fila por web y mes con visitas orgánicas y de pago estimadas, keywords en el top 100, distribución de posiciones, valor del tráfico y gasto estimado en Google Ads. La primera vez trae todo el histórico (desde octubre de 2020, ~1 $ por las 5 webs); después solo los últimos 3 meses (`SEO_FULL_HISTORY=1` fuerza el completo).
- `ranked_keywords` → `domain_keywords`: las 100 keywords orgánicas que más tráfico llevan a cada web (`SEO_KEYWORDS` cambia el número), una foto por ejecución.

Se ejecuta con el workflow **Tráfico y SEO (DataForSEO Labs)**: el día 3 de cada mes (Labs actualiza sus datos una vez al mes) o a mano desde Actions. Cuesta unos céntimos por web y ejecución; el log muestra el coste exacto. El panel lo muestra en **Tráfico y SEO** (`/trafico`).

```bash
npm run seo:dry                 # llama a la API y muestra el resumen, sin guardar
npm run seo -- --site emma      # solo una web
```

### Reseñas (Trustpilot)

`npm run reviews` pide a DataForSEO (Business Data API, modo task) el perfil de Trustpilot de cada web activa: guarda la nota global y el nº de reseñas en `review_snapshots` (una foto por ejecución) y las 100 reseñas más recientes en `reviews` (`REVIEWS_DEPTH` cambia el número; se cobra por cada 20). Las reseñas se identifican por su id de Trustpilot, así que repetir no duplica.

El dominio de Trustpilot es el de la web sin `www`. Si una marca tiene el perfil en otro dominio:

```sql
update sites set trustpilot_domain = 'emma-sleep.com' where base_url = 'https://www.emma-colchon.es';
```

Workflow **Reseñas (Trustpilot vía DataForSEO)**: cada día (40 reseñas más recientes por web; las marcas reciben unas pocas al día, así que no se pierde ninguna) y a mano. Panel: **Reseñas** (`/resenas`).

### Publicidad (Google Ads Transparency)

`npm run ads` consulta el centro de transparencia de anuncios de Google (DataForSEO SERP API, `ads_search`) por el dominio de cada web activa, en España y en todas las plataformas (búsqueda, Shopping, YouTube, Display). Guarda cada anuncio en `ads` (formato, primera y última vez que se mostró) y un resumen diario en `ad_snapshots`: anuncios activos (mostrados en los últimos 7 días), nuevos, por formato, y los de terceros.

Al buscar por dominio salen también anunciantes que enlazan a la web (distribuidores, afiliados, suplantaciones). Se cuentan como propios solo los del anunciante con más anuncios; si no es el correcto o la marca tiene varios:

```sql
update sites set ads_advertiser_ids = '{AR11515220324631183361}' where base_url = 'https://www.maxcolchon.com';
```

`sites.ads_domain` cambia el dominio de búsqueda. Workflow **Publicidad (Google Ads Transparency)**: cada día (~0,10 $). Panel: **Publicidad** (`/publicidad`). Google no publica inversión ni impresiones de anuncios comerciales; la actividad (volumen y ritmo de anuncios) es lo medible.

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
| `sites` | Webs a capturar (`platform`: auto, shopify, woocommerce, generic, google_shopping; `include_url_patterns`: filtro opcional de fichas; `scrape_config`: configuración propia, p. ej. de Google Shopping) |
| `products`, `variants` | Catálogo, con `first_seen_at`, `last_seen_at` y `removed_at` |
| `price_snapshots` | Un registro diario por variante: precio, precio tachado y disponibilidad |
| `scrape_runs` | Cada ejecución: estado, nº de productos, errores y `diagnostics` (sitemaps, códigos HTTP, recuentos) |
| `site_promotions` | Promoción comunicada en la home cada día: descuento principal, códigos, campañas, envío gratis y mensajes |
| `events` | Cambios detectados (alimentan alertas y resumen semanal) |
| `domain_metrics` | Tráfico y SEO por web y mes (DataForSEO Labs) |
| `domain_keywords` | Top keywords orgánicas de cada web, una foto por ejecución |
| `ads`, `ad_snapshots` | Anuncios de Google de cada marca y resumen diario de actividad |
| `review_snapshots`, `reviews` | Nota y nº de reseñas de Trustpilot por fecha, y las reseñas recientes |

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
npm run scrape:dry -- --url https://www.ejemplo.com --include '^/colchon'   # con filtro de URLs (varios: separados por comas)
npm run scrape -- --site dormideo                      # captura y guarda solo Dormideo
```

Variables opcionales: `DATAFORSEO_LOGIN` y `DATAFORSEO_PASSWORD` (solo para webs `google_shopping`), `MAX_PRODUCTS` (límite por web, 2000 por defecto) y `DELAY_MS` (pausa entre peticiones, 500 ms).

## Añadir una web

```sql
insert into sites (brand_id, base_url) values ('<id de la marca>', 'https://www.ejemplo.com');
```

## Buenas prácticas de captura

- Una sola petición a la vez por web, con pausa entre peticiones y reintentos con espera ante errores 429/5xx.
- Solo datos públicos de catálogo; nada de datos personales.
- User-Agent identificable (`CompeteBot`), configurable con `SCRAPER_USER_AGENT`.
