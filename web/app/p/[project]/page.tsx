import Link from 'next/link';
import { EventsTable } from '@/components/events';
import { Badge, BrandDot, Card, Empty, PageHeader, Stat } from '@/components/ui';
import { brandColors, dateTime, num, pct } from '@/lib/format';
import { getProject } from '@/lib/project';
import { getEvents, getRuns } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function Home({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ bienvenida?: string }> }) {
  const { brands, siteIds, path } = await getProject((await params).project);
  const welcome = (await searchParams).bienvenida === '1';
  const [events, runs] = await Promise.all([
    getEvents(siteIds, new Date(Date.now() - 7 * 864e5).toISOString(), new Date(Date.now() + 864e5).toISOString(), 40),
    getRuns(siteIds, 12),
  ]);
  const colors = brandColors(brands);
  const byId = new Map(brands.map((b) => [b.id, b]));
  const visible = brands.filter((b) => b.active_sites > 0 || b.products > 0);
  const lastRun = runs[0];

  return (
    <>
      <PageHeader
        title="Resumen"
        subtitle={lastRun ? `Última captura: ${dateTime(lastRun.started_at)}` : 'Todavía no hay capturas'}
        actions={
          <Link href={path('/informe')} className="text-sm text-accent hover:underline">
            Ver el informe de hoy →
          </Link>
        }
      />

      {(welcome || visible.length === 0) && (
        <div className="mb-4 rounded-md border border-good-line bg-good-soft px-4 py-3 text-sm text-good">
          <strong>Tu proyecto está en marcha.</strong> Estamos capturando las webs por primera vez: según el tamaño de cada catálogo
          tarda de unos minutos a una hora. Puedes seguir el avance en <Link href={path('/capturas')} className="underline">Capturas</Link>.
          Los cambios de precio, stock y promociones aparecen a partir de mañana.
        </div>
      )}

      {visible.length === 0 ? (
        <Card>
          <Empty>
            Añade tu marca y tus competidores en <Link href={path('/marcas')} className="text-accent">Marcas y webs</Link>.
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((b) => {
            const discounted = b.variants ? (100 * b.discounted_variants) / b.variants : null;
            return (
              <Card
                key={b.id}
                title={
                  <Link href={path(`/marcas/${b.id}`)} className="inline-flex items-center gap-2 hover:underline">
                    <BrandDot color={colors[b.id]} />
                    {b.name}
                  </Link>
                }
                right={b.is_own ? <Badge tone="accent">Tu marca</Badge> : null}
              >
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Productos" value={num(b.products)} hint={`${num(b.variants)} variantes`} />
                  <Stat label="Con precio tachado" value={pct(discounted)} hint="de las variantes" />
                  <Stat label="Sin stock" value={num(b.out_of_stock_variants)} hint="variantes" />
                </div>
                <div className="mt-4 border-t border-line pt-3 text-sm">
                  <div className="text-xs text-ink-2">Promoción en la home</div>
                  {b.promo_date ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="num font-semibold">
                        {b.main_discount_pct !== null ? `${b.up_to ? 'Hasta ' : ''}${pct(b.main_discount_pct)}` : 'Sin descuento anunciado'}
                      </span>
                      {(b.campaigns ?? []).map((c) => (
                        <Badge key={c} tone="warn">
                          {c}
                        </Badge>
                      ))}
                      {(b.codes ?? []).map((c) => (
                        <Badge key={c}>Código {c}</Badge>
                      ))}
                      {b.free_shipping && <Badge>Envío gratis</Badge>}
                    </div>
                  ) : (
                    <div className="mt-1 text-ink-3">Sin datos</div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-ink-3">
                  <span>
                    {b.avg_rating ? `★ ${Number(b.avg_rating).toLocaleString('es-ES')} · ${num(b.reviews)} reseñas` : 'Sin valoraciones publicadas'}
                  </span>
                  {b.last_run_status === 'error' ? (
                    <Badge tone="bad">Error en la captura</Badge>
                  ) : b.active_sites === 0 ? (
                    <Badge>Pausada</Badge>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card title="Cambios de los últimos 7 días" className="mt-6" right={<Link href={path('/informe')} className="text-xs text-accent hover:underline">Informe diario →</Link>}>
        <EventsTable
          events={events}
          productHref={(id) => path(`/productos/${id}`)}
          brandName={(id) => byId.get(id)?.name ?? '—'}
          brandColor={(id) => colors[id] ?? '#8a93a6'}
        />
      </Card>
    </>
  );
}
