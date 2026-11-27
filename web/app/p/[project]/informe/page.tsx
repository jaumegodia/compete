import Link from 'next/link';
import { EventsTable } from '@/components/events';
import { Badge, BrandDot, Card, Empty, PageHeader, Table, buttonClass } from '@/components/ui';
import { EVENT_LABELS, TZ, brandColors, date, dateTime, num, pct, shiftDay, todayMadrid } from '@/lib/format';
import { getProject } from '@/lib/project';
import { getEvents, getPromotions, getRuns, type EventRow, type PromoRow } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const madridDay = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ });
const TYPES = ['price_change', 'discount_start', 'discount_end', 'new_product', 'removed_product', 'out_of_stock', 'back_in_stock', 'promo_change'];

function promoText(p: PromoRow | undefined) {
  if (!p) return null;
  return {
    main: p.main_discount_pct !== null ? `${p.up_to ? 'Hasta ' : ''}${pct(p.main_discount_pct)}` : 'Sin descuento anunciado',
    tags: [...p.campaigns, ...p.codes.map((c) => `Código ${c}`), ...(p.free_shipping ? ['Envío gratis'] : [])],
  };
}

export default async function Informe({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ fecha?: string }>;
}) {
  const [{ project }, { fecha }] = await Promise.all([params, searchParams]);
  const { brands, sites, siteIds, path } = await getProject(project);
  const today = todayMadrid();
  const day = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : today;

  const [rawEvents, promos, runs] = await Promise.all([
    getEvents(siteIds, `${shiftDay(day, -1)}T20:00:00Z`, `${shiftDay(day, 1)}T04:00:00Z`),
    getPromotions(siteIds, shiftDay(day, -14)),
    getRuns(siteIds, 100),
  ]);
  const events = rawEvents.filter((e) => madridDay(e.detected_at) === day);
  const dayRuns = runs.filter((r) => madridDay(r.started_at) === day);
  const colors = brandColors(brands);
  const name = (id: string) => brands.find((b) => b.id === id)?.name ?? '—';
  const visible = brands.filter((b) => b.active_sites > 0 || b.products > 0);

  const byBrand = new Map<string, EventRow[]>();
  for (const e of events) {
    const b = e.site?.brand_id;
    if (!b) continue;
    byBrand.set(b, [...(byBrand.get(b) ?? []), e]);
  }

  const drops = events
    .filter((e) => e.type === 'price_change' && Number(e.new_value?.change_pct) < 0)
    .sort((a, b) => Number(a.new_value?.change_pct) - Number(b.new_value?.change_pct))
    .slice(0, 10);
  const rises = events
    .filter((e) => e.type === 'price_change' && Number(e.new_value?.change_pct) > 0)
    .sort((a, b) => Number(b.new_value?.change_pct) - Number(a.new_value?.change_pct))
    .slice(0, 10);

  return (
    <>
      <PageHeader
        title="Informe diario"
        subtitle={`${date(day)}${day === today ? ' (hoy)' : ''} · ${num(events.length)} cambios detectados`}
        actions={
          <>
            <Link href={`${path('/informe')}?fecha=${shiftDay(day, -1)}`} className={buttonClass}>
              ← Día anterior
            </Link>
            {day < today && (
              <Link href={`${path('/informe')}?fecha=${shiftDay(day, 1)}`} className={buttonClass}>
                Día siguiente →
              </Link>
            )}
          </>
        }
      />

      <Card title="Cambios por marca" className="mb-4">
        <Table>
          <thead>
            <tr>
              <th>Marca</th>
              {TYPES.map((t) => (
                <th key={t} className="text-right">
                  {EVENT_LABELS[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => {
              const list = byBrand.get(b.id) ?? [];
              return (
                <tr key={b.id}>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <BrandDot color={colors[b.id]} />
                      {b.name}
                      {b.is_own && <Badge tone="accent">Tu marca</Badge>}
                    </span>
                  </td>
                  {TYPES.map((t) => {
                    const c = list.filter((e) => e.type === t).length;
                    return (
                      <td key={t} className={`num text-right ${c ? 'font-semibold' : 'text-ink-3'}`}>
                        {c || '·'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card title="Promoción anunciada en la home" className="mb-4">
        <Table>
          <thead>
            <tr>
              <th>Marca</th>
              <th>Hoy</th>
              <th>Captura anterior</th>
              <th>Mensajes</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => {
              const siteIds = sites.filter((s) => s.brand_id === b.id).map((s) => s.id);
              const mine = promos.filter((p) => siteIds.includes(p.site_id));
              const current = mine.find((p) => p.captured_on === day);
              const previous = mine.find((p) => p.captured_on < day);
              const c = promoText(current);
              const prev = promoText(previous);
              const changed = c && prev && (c.main !== prev.main || c.tags.join() !== prev.tags.join());
              return (
                <tr key={b.id}>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <BrandDot color={colors[b.id]} />
                      {b.name}
                    </span>
                  </td>
                  <td>
                    {c ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="num font-semibold">{c.main}</span>
                        {c.tags.map((t) => (
                          <Badge key={t} tone="warn">
                            {t}
                          </Badge>
                        ))}
                        {changed && <Badge tone="accent">Cambia</Badge>}
                      </div>
                    ) : (
                      <span className="text-ink-3">Sin captura</span>
                    )}
                  </td>
                  <td className="text-ink-2">
                    {prev ? (
                      <>
                        {prev.main}
                        {prev.tags.length ? ` · ${prev.tags.join(' · ')}` : ''}
                        <div className="text-xs text-ink-3">{date(previous!.captured_on)}</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="max-w-sm text-xs text-ink-2">
                    {current?.messages.slice(0, 3).map((m, i) => (
                      <div key={i} className="truncate" title={m.text}>
                        “{m.text}”
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {(drops.length > 0 || rises.length > 0) && (
        <div className="mb-4 grid gap-4">
          <Card title="Mayores bajadas de precio">
            {drops.length ? <EventsTable events={drops} brandName={name} brandColor={(id) => colors[id]} productHref={(id) => path(`/productos/${id}`)} showDate={false} /> : <Empty>Ninguna.</Empty>}
          </Card>
          <Card title="Mayores subidas de precio">
            {rises.length ? <EventsTable events={rises} brandName={name} brandColor={(id) => colors[id]} productHref={(id) => path(`/productos/${id}`)} showDate={false} /> : <Empty>Ninguna.</Empty>}
          </Card>
        </div>
      )}

      <Card title="Todos los cambios del día" className="mb-4">
        <EventsTable events={events} brandName={name} brandColor={(id) => colors[id]} productHref={(id) => path(`/productos/${id}`)} />
      </Card>

      <Card title="Capturas del día">
        {dayRuns.length === 0 ? (
          <Empty>No hubo capturas este día.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Marca</th>
                <th>Estado</th>
                <th className="text-right">Productos</th>
                <th className="text-right">Cambios</th>
                <th>Avisos</th>
              </tr>
            </thead>
            <tbody>
              {dayRuns.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-ink-2">{dateTime(r.started_at)}</td>
                  <td>{r.site ? name(r.site.brand_id) : '—'}</td>
                  <td>
                    <Badge tone={r.status === 'ok' ? 'good' : r.status === 'error' ? 'bad' : 'neutral'}>{r.status === 'running' ? 'En curso' : r.status}</Badge>
                  </td>
                  <td className="num text-right">{num(r.products_found)}</td>
                  <td className="num text-right">{num(r.events_created)}</td>
                  <td className="max-w-xs truncate text-xs text-ink-3" title={r.error ?? ''}>
                    {r.error ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
