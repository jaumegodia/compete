# COMPETE · Panel (MVP)

Panel interno para gestionar las marcas y webs que se capturan y ver los resultados: resumen, informe diario, comparativa de precios, promociones de la home y estado de las capturas.

Next.js 16 (App Router, componentes de servidor) + Supabase + Tailwind 4 + Recharts.

## Proyectos

Todo el panel se ve dentro de un **proyecto**: un mercado con una marca propia y sus competidores (p. ej. Marmota frente a Emma, Flex…; otro cliente de zapatillas frente a los suyos). El selector de la barra lateral cambia de proyecto y se queda en la misma sección. Cada página solo muestra las marcas y webs del proyecto elegido.

- Las marcas y sus webs se comparten: si dos proyectos vigilan la misma web, se captura una sola vez y ambos ven su histórico.
- Pausar una web la pausa en todos los proyectos. Una marca que está en otro proyecto no se puede borrar desde este: solo quitarla del proyecto.
- Los proyectos se crean y se borran en *Marcas y webs*. Al borrar un proyecto se conservan las marcas y sus datos.
- Los enlaces antiguos (`/informe`, `/marcas/…`) llevan a la misma página del primer proyecto.

## Pantallas

Todas cuelgan de `/p/<proyecto>` (p. ej. `/p/marmota/informe`). `/` entra en el primer proyecto.

| Ruta | Qué muestra |
|---|---|
| `/p/<proyecto>` | Resumen por marca (catálogo, precio tachado, stock, promoción de la home, nota) y cambios de los últimos 7 días |
| `…/informe?fecha=AAAA-MM-DD` | Informe diario: cambios por marca, promoción de la home frente a la captura anterior, mayores bajadas y subidas, capturas del día |
| `…/comparativa` | Precio actual de tu marca y sus competidores en una misma medida (p. ej. 150x190), de más barato a más caro |
| `…/promociones` | Promoción anunciada en la home de cada marca, día a día |
| `…/trafico`, `…/resenas`, `…/publicidad` | Tráfico orgánico y keywords, reseñas de Trustpilot y anuncios de Google |
| `…/marcas` | Competidores del proyecto (nuevos o ya capturados en otro proyecto), webs de cada marca, pausar/reactivar, capturas, alta y baja de proyectos |
| `…/marcas/[id]` | Catálogo actual de una marca, con filtros y productos retirados |
| `…/productos/[id]` | Ficha de producto: histórico de precio, variantes y cambios |
| `…/capturas` | Últimas ejecuciones del scraper en las webs del proyecto |

## Puesta en marcha

```bash
cd web
npm install
cp .env.example .env.local   # y rellena SUPABASE_SERVICE_ROLE_KEY
npm run dev                   # http://localhost:3000
```

Variables:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: la clave secreta solo se usa en el servidor; nunca llega al navegador.
- `DASHBOARD_PASSWORD`: el navegador pide usuario y contraseña (vale cualquier usuario). Opcional en local (`npm run dev`); en producción es obligatoria y sin ella el panel responde 503.
- `GITHUB_TOKEN` (opcional): token con permiso *Actions: write* sobre el repositorio para lanzar capturas desde el panel. `GITHUB_REPO` por defecto es `jaumegodia/compete`.

## Despliegue

Cualquier hosting de Next.js (Vercel, Render…) con *root directory* `web`, comando de build `npm install && npm run build` y de arranque `npm start`, y las variables anteriores.
