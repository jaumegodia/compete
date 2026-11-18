# COMPETE · Panel (MVP)

Panel interno para gestionar las marcas y webs que se capturan y ver los resultados: resumen, informe diario, comparativa de precios, promociones de la home y estado de las capturas.

Next.js 16 (App Router, componentes de servidor) + Supabase + Tailwind 4 + Recharts.

## Pantallas

| Ruta | Qué muestra |
|---|---|
| `/` | Resumen por marca (catálogo, precio tachado, stock, promoción de la home, nota) y cambios de los últimos 7 días |
| `/informe?fecha=AAAA-MM-DD` | Informe diario: cambios por marca, promoción de la home frente a la captura anterior, mayores bajadas y subidas, capturas del día |
| `/comparativa` | Precio actual de tu marca y sus competidores en una misma medida (p. ej. 150x190), de más barato a más caro |
| `/promociones` | Promoción anunciada en la home de cada marca, día a día |
| `/marcas` | Alta de marcas y webs, competidores de cada marca propia, pausar/reactivar, borrar y lanzar capturas |
| `/marcas/[id]` | Catálogo actual de una marca, con filtros y productos retirados |
| `/productos/[id]` | Ficha de producto: histórico de precio, variantes y cambios |
| `/capturas` | Últimas ejecuciones del scraper |

## Puesta en marcha

```bash
cd web
npm install
cp .env.example .env.local   # y rellena SUPABASE_SERVICE_ROLE_KEY
npm run dev                   # http://localhost:3000
```

Variables:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: la clave secreta solo se usa en el servidor; nunca llega al navegador.
- `DASHBOARD_PASSWORD` (opcional): si la defines, el navegador pide usuario y contraseña (vale cualquier usuario). Recomendable si publicas el panel en internet.
- `GITHUB_TOKEN` (opcional): token con permiso *Actions: write* sobre el repositorio para lanzar capturas desde el panel. `GITHUB_REPO` por defecto es `jaumegodia/compete`.

## Despliegue

Cualquier hosting de Next.js (Vercel, Render…) con *root directory* `web`, comando de build `npm install && npm run build` y de arranque `npm start`, y las variables anteriores.
