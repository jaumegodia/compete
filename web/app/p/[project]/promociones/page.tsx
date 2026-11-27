import { Badge, BrandDot, Card, Empty, PageHeader, Table } from '@/components/ui';
import { brandColors, date, pct, shiftDay, todayMadrid } from '@/lib/format';
import { getProject } from '@/lib/project';
import { getPromotions } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function Promociones({ params }: { params: Promise<{ project: string }> }) {
  const { brands, sites, siteIds } = await getProject((await params).project);
  const promos = await getPromotions(siteIds, shiftDay(todayMadrid(), -45));
  const colors = brandColors(brands);
  const visible = brands.filter((b) => sites.some((s) => s.brand_id === b.id && promos.some((p) => p.site_id === s.id)));
  const days = [...new Set(promos.map((p) => p.captured_on))].sort().reverse();
  const brandOf = new Map(sites.map((s) => [s.id, s.brand_id]));
  const cell = (brandId: string, day: string) => promos.find((p) => p.captured_on === day && brandOf.get(p.site_id) === brandId);

  return (
    <>
      <PageHeader
        title="Promociones"
        subtitle="Lo que cada marca anuncia en su home (topbar, banners y cabecera), día a día. Útil cuando la marca no publica precios tachados."
      />
      <Card>
        {!days.length ? (
          <Empty>Todavía no hay promociones capturadas.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Día</th>
                {visible.map((b) => (
                  <th key={b.id}>
                    <span className="inline-flex items-center gap-1.5">
                      <BrandDot color={colors[b.id]} />
                      {b.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => (
                <tr key={d}>
                  <td className="whitespace-nowrap text-ink-2">{date(d)}</td>
                  {visible.map((b) => {
                    const p = cell(b.id, d);
                    const prev = days.slice(i + 1).map((x) => cell(b.id, x)).find(Boolean);
                    const changed =
                      p && prev && (Number(p.main_discount_pct) !== Number(prev.main_discount_pct) || p.campaigns.join() !== prev.campaigns.join() || p.codes.join() !== prev.codes.join());
                    return (
                      <td key={b.id} className="align-top">
                        {p ? (
                          <div className="flex flex-col gap-1">
                            <span className="num font-semibold">
                              {p.main_discount_pct !== null ? `${p.up_to ? 'Hasta ' : ''}${pct(p.main_discount_pct)}` : 'Sin descuento'}
                              {changed && <span className="ml-1.5"><Badge tone="accent">Cambia</Badge></span>}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {p.campaigns.map((c) => (
                                <Badge key={c} tone="warn">
                                  {c}
                                </Badge>
                              ))}
                              {p.codes.map((c) => (
                                <Badge key={c}>{c}</Badge>
                              ))}
                              {p.free_shipping && <Badge>Envío gratis</Badge>}
                            </div>
                            {p.messages[0] && (
                              <span className="line-clamp-2 text-xs text-ink-3" title={p.messages.map((m) => m.text).join('\n')}>
                                “{p.messages.find((m) => m.discountPct !== null)?.text ?? p.messages[0].text}”
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
