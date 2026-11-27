# COMPETE · Panel

Producto SaaS: web pública (landing, precios, legales), registro y acceso de usuarios, alta guiada de proyectos, suscripciones con Stripe y el panel con los resultados (resumen, informe diario, comparativa de precios, promociones, tráfico, reseñas, publicidad y capturas).

## Cuentas, workspaces y planes

- **Usuarios**: Supabase Auth con email y contraseña (con confirmación por email) y Google (`GOOGLE_AUTH_ENABLED=1` cuando el proveedor esté configurado en Supabase). Al registrarse, un disparador crea su perfil (`profiles`) y su workspace (`workspaces` + `workspace_members`).
- **Workspaces**: cada proyecto pertenece a uno. El usuario solo ve los proyectos de sus workspaces; el acceso se comprueba en el servidor (`lib/project.ts`, `marcas/actions.ts`). Los admins (`profiles.is_admin`) ven todos los proyectos y tienen los controles globales.
- **Planes** (`plans`): límites de proyectos y competidores y módulos (`catalog`, `promos`, `reviews`, `ads`, `seo`, `alerts`). Prueba de 14 días sin tarjeta (plan `trial`, 3 competidores). Al caducar la prueba o la suscripción, el panel manda a `/cuenta`.
- **Stripe**: `/cuenta` abre Checkout o el portal de cliente; el webhook `/api/stripe/webhook` copia la suscripción al workspace. Los precios de Stripe se enlazan en `plans.stripe_price_monthly` y `stripe_price_yearly`.
- **Pausas**: pausar un competidor (`project_competitors.paused_at`) o un proyecto (`projects.paused_at`) solo afecta a ese proyecto. La vista `v_site_demand` decide qué webs se capturan y con qué módulos: las que siga algún proyecto vivo sin pausar. `sites.active` queda como interruptor global de administración.
- **Idiomas**: las páginas nuevas leen sus textos de `lib/i18n.ts` (es/en, cookie `lang`); el resto del panel se irá pasando ahí.

Para hacer admin a un usuario: `update profiles set is_admin = true where email = '…';` y, para que vea los proyectos internos como suyos, añádelo al workspace interno: `insert into workspace_members (workspace_id, user_id) select w.id, p.user_id from workspaces w, profiles p where w.plan_id = 'internal' and p.email = '…';`

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
- `SUPABASE_PUBLISHABLE_KEY`: clave pública, para la sesión de los usuarios.
- `SITE_URL`: URL pública (enlaces de emails, vuelta de Google y Stripe). En Supabase, *Authentication → URL Configuration*: *Site URL* = esta URL y *Redirect URLs* = `<SITE_URL>/auth/callback`.
- `GOOGLE_AUTH_ENABLED=1`: muestra el botón de Google.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: pagos. Webhook en `<SITE_URL>/api/stripe/webhook` con los eventos `checkout.session.completed` y `customer.subscription.created|updated|deleted`.
- `GITHUB_TOKEN` (opcional): token con permiso *Actions: write* sobre el repositorio para lanzar capturas desde el panel. `GITHUB_REPO` por defecto es `jaumegodia/compete`.

## Despliegue

Cualquier hosting de Next.js (Vercel, Render…) con *root directory* `web`, comando de build `npm install && npm run build` y de arranque `npm start`, y las variables anteriores.
