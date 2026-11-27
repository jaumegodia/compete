import Link from 'next/link';
import { Badge, BrandDot, Card, Empty, PageHeader, Table, buttonClass, inputClass } from '@/components/ui';
import { TrafficChart, type TrafficPoint } from '@/components/traffic-chart';
import { db, fetchAll, must } from '@/lib/db';
import { brandColors, date, diffPct, num, pct } from '@/lib/format';
import { getProject } from '@/lib/project';

export const dynamic = 'force-dynamic';

interface MetricRow {
  site_id: string;
  month: string;
  organic_etv: number | null;
  organic_keywords: number | null;
  organic_pos_1: number | null;
  organic_pos_2_3: number | null;
  organic_pos_4_10: number | null;
  organic_traffic_value: number | null;
  organic_new: number | null;
  organic_lost: number | null;
  fetched_at: string;
}

interface KeywordRow {
  site_id: string;
  captured_on: string;
  keyword: string;
  position: number | null;
  search_volume: number | null;
  etv: number | null;
  url: string | null;
}

const METRICS = {
  organic_etv: 'Visitas orgánicas / mes',
  organic_keywords: 'Keywords en el top 100',
  top10: 'Keywords en el top 10',
} as const;
type Metric = keyof typeof METRICS;

const RANGES = { '12': '12 meses', '24': '24 meses', '60': '5 años' } as const;

type Agg = {
  organic_etv: number;
  organic_keywords: number;
  top3: number;
  top10: number;
  organic_traffic_value: number;
  organic_new: number;
  organic_lost: number;
};
const empty = (): Agg => ({ organic_etv: 0, organic_keywords: 0, top3: 0, top10: 0, organic_traffic_value: 0, organic_new: 0, organic_lost: 0 });
const add = (a: Agg, r: MetricRow) => {
  const top3 = (r.organic_pos_1 ?? 0) + (r.organic_pos_2_3 ?? 0);
  a.organic_etv += r.organic_etv ?? 0;
  a.organic_keywords += r.organic_keywords ?? 0;
  a.top3 += top3;
  a.top10 += top3 + (r.organic_pos_4_10 ?? 0);
  a.organic_traffic_value += r.organic_traffic_value ?? 0;
  a.organic_new += r.organic_new ?? 0;
  a.organic_lost += r.organic_lost ?? 0;
};
const usd = (v: number) => v.toLocaleString('es-ES', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const monthLabel = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
const shiftMonth = (m: string, k: number) => {
  const d = new Date(`${m}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + k);
  return d.toISOString().slice(0, 7) + '-01';
};

function Delta({ now, before }: { now: number; before: number | undefined }) {
  if (before === undefined || !before) return null;
  const d = diffPct(now, before);
  if (d === null || Math.abs(d) < 0.5) return <span className="ml-1 text-xs text-ink-3">=</span>;
  return <span className={`ml-1 text-xs ${d > 0 ? 'text-good' : 'text-bad'}`}>{d > 0 ? '+' : ''}{pct(d)}</span>;
}

export default async function Trafico({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ metrica?: string; rango?: string; marca?: string }>;
}) {
  const [{ project }, sp] = await Promise.all([params, searchParams]);
  const metric: Metric = sp.metrica && sp.metrica in METRICS ? (sp.metrica as Metric) : 'organic_etv';
  const range = sp.rango && sp.rango in RANGES ? sp.rango : '24';

  const { brands, sites, path } = await getProject(project);
  const colors = brandColors(brands);
  const brandOfSite = new Map(sites.map((s) => [s.id, s.brand_id]));
  const siteIds = sites.filter((s) => s.active).map((s) => s.id);

  const rows = siteIds.length
    ? await fetchAll<MetricRow>(
        (from, to) =>
          db()
            .from('domain_metrics')
            .select('site_id, month, organic_etv, organic_keywords, organic_pos_1, organic_pos_2_3, organic_pos_4_10, organic_traffic_value, organic_new, organic_lost, fetched_at')
            .in('site_id', siteIds)
            .order('month')
            .order('site_id')
            .range(from, to),
        'domain_metrics',
      )
    : [];

  if (!rows.length) {
    return (
      <>
        <PageHeader title="Tráfico y SEO" subtitle="Estimaciones de DataForSEO Labs · Google España" />
        <Card>
          <Empty>
            Todavía no hay datos. Lánzalos en GitHub: Actions → «Tráfico y SEO (DataForSEO Labs)» → Run workflow.
          </Empty>
        </Card>
      </>
    );
  }

  // Agregado por marca y mes (una marca puede tener varias webs)
  const byBrandMonth = new Map<string, Map<string, Agg>>();
  for (const r of rows) {
    const b = brandOfSite.get(r.site_id);
    if (!b) continue;
    const months = byBrandMonth.get(b) ?? new Map<string, Agg>();
    byBrandMonth.set(b, months);
    const a = months.get(r.month) ?? empty();
    months.set(r.month, a);
    add(a, r);
  }
  const shown = brands.filter((b) => byBrandMonth.has(b.id));
  const lastMonth = rows.reduce((m, r) => (r.month > m ? r.month : m), rows[0].month);
  const prevMonth = shiftMonth(lastMonth, -1);
  const yearAgo = shiftMonth(lastMonth, -12);
  const fetchedAt = rows.reduce((m, r) => (r.fetched_at > m ? r.fetched_at : m), rows[0].fetched_at);

  const value = (a: Agg | undefined) => (a ? (metric === 'top10' ? a.top10 : a[metric]) : null);
  const firstMonth = shiftMonth(lastMonth, -Number(range) + 1);
  const months = [...new Set(rows.map((r) => r.month))].filter((m) => m >= firstMonth).sort();
  const chart: TrafficPoint[] = months.map((m) => ({
    month: m,
    ...Object.fromEntries(shown.map((b) => [b.id, value(byBrandMonth.get(b.id)?.get(m))])),
  }));

  const ranking = shown
    .map((b) => ({ brand: b, now: byBrandMonth.get(b.id)!.get(lastMonth), prev: byBrandMonth.get(b.id)!.get(prevMonth), year: byBrandMonth.get(b.id)!.get(yearAgo) }))
    .sort((a, b) => (b.now?.organic_etv ?? 0) - (a.now?.organic_etv ?? 0));
  const totalOrganic = ranking.reduce((s, r) => s + (r.now?.organic_etv ?? 0), 0);

  // Top keywords de la marca elegida (última foto de cada web)
  const kwBrand = shown.find((b) => b.id === sp.marca) ?? ranking[0]?.brand;
  const kwSites = sites.filter((s) => s.brand_id === kwBrand?.id).map((s) => s.id);
  const kwRaw = kwSites.length
    ? (must(
        await db()
          .from('domain_keywords')
          .select('site_id, captured_on, keyword, position, search_volume, etv, url')
          .in('site_id', kwSites)
          .order('captured_on', { ascending: false })
          .order('etv', { ascending: false })
          .limit(1000),
        'domain_keywords',
      ) as KeywordRow[])
    : [];
  const latestKw = new Map<string, string>();
  for (const k of kwRaw) if (!latestKw.has(k.site_id)) latestKw.set(k.site_id, k.captured_on);
  const keywords = kwRaw.filter((k) => latestKw.get(k.site_id) === k.captured_on).sort((a, b) => (b.etv ?? 0) - (a.etv ?? 0)).slice(0, 50);
  const kwDate = [...latestKw.values()].sort().at(-1);

  const link = (p: Record<string, string>) => {
    const q = new URLSearchParams({ metrica: metric, rango: range, ...(kwBrand ? { marca: kwBrand.id } : {}), ...p });
    return `${path('/trafico')}?${q}`;
  };

  return (
    <>
      <PageHeader
        title="Tráfico y SEO"
        subtitle={`Estimaciones de DataForSEO Labs · Google España · último mes: ${monthLabel(lastMonth)} · actualizado ${date(fetchedAt)}`}
      />

      <Card title={`Comparativa de ${monthLabel(lastMonth)}`} className="mb-4">
        <Table>
          <thead>
            <tr>
              <th>Marca</th>
              <th className="text-right">Visitas orgánicas</th>
              <th className="text-right">Cuota</th>
              <th className="text-right">Keywords</th>
              <th className="text-right">Top 3</th>
              <th className="text-right">Top 10</th>
              <th className="text-right">Valor del tráfico</th>
              <th className="text-right">Keywords nuevas</th>
              <th className="text-right">Keywords perdidas</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map(({ brand, now, prev, year }) => (
              <tr key={brand.id}>
                <td className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    <BrandDot color={colors[brand.id]} />
                    <Link href={path(`/marcas/${brand.id}`)} className="hover:underline">{brand.name}</Link>
                    {brand.is_own && <Badge tone="accent">Tu marca</Badge>}
                  </span>
                </td>
                <td className="num whitespace-nowrap text-right">
                  {now ? num(Math.round(now.organic_etv)) : '—'}
                  {now && <Delta now={now.organic_etv} before={prev?.organic_etv} />}
                  {now && year && <div className="text-xs text-ink-3">vs. hace un año <Delta now={now.organic_etv} before={year.organic_etv} /></div>}
                </td>
                <td className="num text-right">{now && totalOrganic ? pct((100 * now.organic_etv) / totalOrganic) : '—'}</td>
                <td className="num whitespace-nowrap text-right">
                  {now ? num(now.organic_keywords) : '—'}
                  {now && <Delta now={now.organic_keywords} before={prev?.organic_keywords} />}
                </td>
                <td className="num text-right">{now ? num(now.top3) : '—'}</td>
                <td className="num text-right">{now ? num(now.top10) : '—'}</td>
                <td className="num text-right">{now ? usd(now.organic_traffic_value) : '—'}</td>
                <td className="num text-right text-good">{now ? `+${num(now.organic_new)}` : '—'}</td>
                <td className="num text-right text-bad">{now ? `−${num(now.organic_lost)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-ink-3">
          Cifras estimadas a partir de posiciones y volúmenes de búsqueda, no de analítica real: sirven para comparar marcas y ver tendencias, no como
          valor absoluto. «Valor del tráfico» es lo que costaría el tráfico orgánico en Google Ads. Variación respecto al mes anterior; keywords nuevas y perdidas en el top 100 durante el mes. El tráfico de pago no se muestra: la estimación de DataForSEO no capta bien las campañas actuales (Shopping, Performance Max).
        </p>
      </Card>

      <Card
        title="Evolución"
        className="mb-4"
        right={
          <form className="flex flex-wrap gap-2">
            <select name="metrica" defaultValue={metric} className={inputClass}>
              {Object.entries(METRICS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select name="rango" defaultValue={range} className={inputClass}>
              {Object.entries(RANGES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {kwBrand && <input type="hidden" name="marca" value={kwBrand.id} />}
            <button className={buttonClass}>Ver</button>
          </form>
        }
      >
        <TrafficChart data={chart} series={shown.map((b) => ({ key: b.id, name: b.name, color: colors[b.id] }))} label={`${METRICS[metric]} por marca`} />
      </Card>

      <Card
        title={`Keywords que más tráfico llevan${kwBrand ? ` a ${kwBrand.name}` : ''}`}
        right={
          <div className="flex flex-wrap gap-1.5">
            {shown.map((b) => (
              <Link
                key={b.id}
                href={link({ marca: b.id })}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${b.id === kwBrand?.id ? 'border-accent text-accent' : 'border-line text-ink-2 hover:bg-hover'}`}
              >
                <BrandDot color={colors[b.id]} />
                {b.name}
              </Link>
            ))}
          </div>
        }
      >
        {keywords.length === 0 ? (
          <Empty>Sin keywords guardadas para esta marca.</Empty>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th className="text-right">Posición</th>
                  <th className="text-right">Búsquedas / mes</th>
                  <th className="text-right">Visitas est.</th>
                  <th>Página</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((k) => (
                  <tr key={`${k.site_id}-${k.keyword}`}>
                    <td>{k.keyword}</td>
                    <td className="num text-right">{k.position ?? '—'}</td>
                    <td className="num text-right">{num(k.search_volume)}</td>
                    <td className="num text-right">{k.etv === null ? '—' : num(Math.round(k.etv))}</td>
                    <td className="max-w-xs truncate text-ink-2">
                      {k.url ? (
                        <a href={k.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {k.url.replace(/^https?:\/\/(www\.)?[^/]+/, '') || '/'}
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {kwDate && <p className="mt-3 text-xs text-ink-3">Foto del {date(kwDate)} · las 50 primeras por visitas estimadas.</p>}
          </>
        )}
      </Card>
    </>
  );
}
