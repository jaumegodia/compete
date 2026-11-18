import Link from 'next/link';
import { EventsTable } from '@/components/events';
import { Badge, BrandDot, Card, Empty, PageHeader, Stat } from '@/components/ui';
import { brandColors, dateTime, num, pct } from '@/lib/format';
import { getBrands, getEvents, getRuns } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [brands, events, runs] = await Promise.all([
    getBrands(),
    getEvents(new Date(Date.now() - 7 * 864e5).toISOString(), new Date(Date.now() + 864e5).toISOString(), 40),
    getRuns(12),
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
          <Link href="/informe" className="text-sm text-accent hover:underline">
            Ver el informe de hoy →
          </Link>
        }
      />

      {visible.length === 0 ? (
        <Card>
          <Empty>
            Añade tu marca y tus competidores en <Link href="/marcas" className="text-accent">Marcas y webs</Link>.
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
                  <Link href={`/marcas/${b.id}`} className="inline-flex items-center gap-2 hover:underline">
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

      <Card title="Cambios de los últimos 7 días" className="mt-6" right={<Link href="/informe" className="text-xs text-accent hover:underline">Informe diario →</Link>}>
        <EventsTable
          events={events}
          brandName={(id) => byId.get(id)?.name ?? '—'}
          brandColor={(id) => colors[id] ?? '#8a8a85'}
        />
      </Card>
    </>
  );
}
