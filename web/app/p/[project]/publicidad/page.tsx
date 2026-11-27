import { Badge, BrandDot, Card, Empty, PageHeader, Table, buttonClass, inputClass } from '@/components/ui';
import { TrafficChart, type TrafficPoint } from '@/components/traffic-chart';
import { db, fetchAll } from '@/lib/db';
import { brandColors, date, num } from '@/lib/format';
import { getProject } from '@/lib/project';

export const dynamic = 'force-dynamic';

interface SnapshotRow {
  site_id: string;
  captured_on: string;
  ads_total: number | null;
  ads_active: number | null;
  ads_new_7d: number | null;
  by_format: Record<string, number> | null;
  advertisers: { id: string; name: string | null }[] | null;
  third_party_active: number | null;
  third_party: { id: string; name: string | null; active: number }[] | null;
}

interface AdRow {
  site_id: string;
  creative_id: string;
  advertiser_name: string | null;
  format: string | null;
  url: string | null;
  first_shown: string | null;
  last_shown: string | null;
}

const FORMATS: Record<string, string> = { text: 'Texto', image: 'Imagen', video: 'Vídeo' };
const WEEKS = 16;

/** Lunes (UTC) de la semana de una fecha, como AAAA-MM-DD. */
const mondayOf = (iso: string) => {
  const d = new Date(iso);
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

export default async function Publicidad({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ marca?: string; formato?: string }>;
}) {
  const [{ project }, sp] = await Promise.all([params, searchParams]);
  const { brands, sites } = await getProject(project);
  const colors = brandColors(brands);
  const brandOfSite = new Map(sites.map((s) => [s.id, s.brand_id]));
  const siteIds = sites.filter((s) => s.active).map((s) => s.id);
  const thisMonday = mondayOf(new Date().toISOString());
  const since = new Date(new Date(`${thisMonday}T12:00:00Z`).getTime() - (WEEKS - 1) * 7 * 864e5).toISOString();

  const [snapshots, ads] = siteIds.length
    ? await Promise.all([
        fetchAll<SnapshotRow>(
          (from, to) =>
            db()
              .from('ad_snapshots')
              .select('site_id, captured_on, ads_total, ads_active, ads_new_7d, by_format, advertisers, third_party_active, third_party')
              .eq('platform', 'google')
              .in('site_id', siteIds)
              .order('captured_on', { ascending: false })
              .order('site_id')
              .range(from, to),
          'ad_snapshots',
        ),
        fetchAll<AdRow>(
          (from, to) =>
            db()
              .from('ads')
              .select('site_id, creative_id, advertiser_name, format, url, first_shown, last_shown')
              .eq('platform', 'google')
              .eq('own', true)
              .in('site_id', siteIds)
              .gte('first_shown', since)
              .order('first_shown', { ascending: false })
              .order('creative_id')
              .range(from, to),
          'ads',
        ),
      ])
    : [[], []];

  if (!snapshots.length) {
    return (
      <>
        <PageHeader title="Publicidad" subtitle="Google Ads Transparency vía DataForSEO" />
        <Card>
          <Empty>Todavía no hay datos. Lánzalos en GitHub: Actions → «Publicidad (Google Ads Transparency)» → Run workflow.</Empty>
        </Card>
      </>
    );
  }

  // Última foto por web, agregada por marca
  const latestBySite = new Map<string, SnapshotRow>();
  for (const s of snapshots) if (!latestBySite.has(s.site_id)) latestBySite.set(s.site_id, s);
  const since30 = Date.now() - 30 * 864e5;
  const rows = brands
    .map((b) => {
      const snaps = sites.filter((s) => s.brand_id === b.id).map((s) => latestBySite.get(s.id)).filter((s): s is SnapshotRow => !!s);
      if (!snaps.length) return null;
      const sum = (k: 'ads_total' | 'ads_active' | 'ads_new_7d' | 'third_party_active') => snaps.reduce((t, s) => t + (s[k] ?? 0), 0);
      const formats: Record<string, number> = {};
      for (const s of snaps) for (const [f, c] of Object.entries(s.by_format ?? {})) formats[f] = (formats[f] ?? 0) + c;
      const bSites = new Set(snaps.map((s) => s.site_id));
      return {
        brand: b,
        active: sum('ads_active'),
        total: sum('ads_total'),
        new7: sum('ads_new_7d'),
        new30: ads.filter((a) => bSites.has(a.site_id) && a.first_shown && new Date(a.first_shown).getTime() >= since30).length,
        formats,
        advertisers: snaps.flatMap((s) => s.advertisers ?? []),
        thirdActive: sum('third_party_active'),
        third: snaps.flatMap((s) => s.third_party ?? []),
      };
    })
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => b.active - a.active);
  const lastDate = snapshots[0].captured_on;

  // Anuncios nuevos por semana y marca
  const weeks = Array.from({ length: WEEKS }, (_, i) =>
    new Date(new Date(`${thisMonday}T12:00:00Z`).getTime() - (WEEKS - 1 - i) * 7 * 864e5).toISOString().slice(0, 10),
  );
  const perWeek = new Map<string, number>();
  for (const a of ads) {
    if (!a.first_shown) continue;
    const key = `${brandOfSite.get(a.site_id)}|${mondayOf(a.first_shown)}`;
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
  }
  const chart: TrafficPoint[] = weeks.map((w) => ({ month: w, ...Object.fromEntries(rows.map((r) => [r.brand.id, perWeek.get(`${r.brand.id}|${w}`) ?? 0])) }));

  // Últimos anuncios lanzados
  const selected = rows.find((r) => r.brand.id === sp.marca)?.brand;
  const format = sp.formato && sp.formato in FORMATS ? sp.formato : '';
  const list = ads
    .filter((a) => !selected || brandOfSite.get(a.site_id) === selected.id)
    .filter((a) => !format || a.format === format)
    .slice(0, 60);

  return (
    <>
      <PageHeader title="Publicidad" subtitle={`Anuncios en Google (búsqueda, Shopping, YouTube y Display) en España · Ads Transparency · actualizado ${date(lastDate)}`} />

      <Card title="Comparativa" className="mb-4">
        <Table>
          <thead>
            <tr>
              <th>Marca</th>
              <th className="text-right">Activos (7 días)</th>
              <th className="text-right">Nuevos (7 días)</th>
              <th className="text-right">Nuevos (30 días)</th>
              <th className="text-right">Texto</th>
              <th className="text-right">Imagen</th>
              <th className="text-right">Vídeo</th>
              <th className="text-right">Histórico</th>
              <th className="text-right">De terceros activos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.brand.id}>
                <td className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    <BrandDot color={colors[r.brand.id]} />
                    {r.advertisers[0] ? (
                      <a
                        href={`https://adstransparency.google.com/advertiser/${r.advertisers[0].id}?region=ES`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                        title={r.advertisers.map((a) => a.name).join(', ')}
                      >
                        {r.brand.name}
                      </a>
                    ) : (
                      r.brand.name
                    )}
                    {r.brand.is_own && <Badge tone="accent">Tu marca</Badge>}
                  </span>
                  {r.advertisers[0]?.name && <div className="text-xs text-ink-3">{r.advertisers[0].name}</div>}
                </td>
                <td className="num text-right font-medium">{num(r.active)}</td>
                <td className="num text-right">{r.new7 ? <Badge tone="accent">{num(r.new7)}</Badge> : '0'}</td>
                <td className="num text-right">{num(r.new30)}</td>
                <td className="num text-right">{num(r.formats.text ?? 0)}</td>
                <td className="num text-right">{num(r.formats.image ?? 0)}</td>
                <td className="num text-right">{num(r.formats.video ?? 0)}</td>
                <td className="num text-right text-ink-3">{num(r.total)}</td>
                <td className="num text-right" title={r.third.map((t) => `${t.name ?? t.id}: ${t.active}`).join('\n')}>
                  {r.thirdActive ? num(r.thirdActive) : '—'}
                  {r.third.length > 0 && <div className="text-xs text-ink-3">{r.third.length} anunciantes</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-ink-3">
          «Activos» son los anuncios mostrados en los últimos 7 días; «nuevos», los que se mostraron por primera vez en ese periodo. Se cuentan los del
          anunciante de cada marca; «de terceros» son anuncios de otros anunciantes que enlazan a su web (distribuidores, afiliados o posibles
          suplantaciones; pasa el ratón para ver quiénes). Google no publica inversión ni impresiones de anuncios comerciales: el volumen y el ritmo de
          anuncios es la medida de actividad disponible.
        </p>
      </Card>

      <Card title={`Anuncios nuevos por semana · últimas ${WEEKS} semanas`} className="mb-4">
        <TrafficChart data={chart} series={rows.map((r) => ({ key: r.brand.id, name: r.brand.name, color: colors[r.brand.id] }))} label="Anuncios nuevos por semana y marca" period="week" />
      </Card>

      <Card
        title="Últimos anuncios lanzados"
        right={
          <form className="flex flex-wrap gap-2">
            <select name="marca" defaultValue={selected?.id ?? ''} className={inputClass}>
              <option value="">Todas las marcas</option>
              {rows.map((r) => (
                <option key={r.brand.id} value={r.brand.id}>{r.brand.name}</option>
              ))}
            </select>
            <select name="formato" defaultValue={format} className={inputClass}>
              <option value="">Todos los formatos</option>
              {Object.entries(FORMATS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button className={buttonClass}>Filtrar</button>
          </form>
        }
      >
        {list.length === 0 ? (
          <Empty>No hay anuncios nuevos con estos filtros en las últimas {WEEKS} semanas.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Marca</th>
                <th>Formato</th>
                <th>Primera vez</th>
                <th>Última vez</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((a) => {
                const brandId = brandOfSite.get(a.site_id) ?? '';
                const live = a.last_shown && Date.now() - new Date(a.last_shown).getTime() < 7 * 864e5;
                return (
                  <tr key={`${a.site_id}-${a.creative_id}`}>
                    <td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <BrandDot color={colors[brandId] ?? '#8a93a6'} />
                        {brands.find((b) => b.id === brandId)?.name}
                      </span>
                    </td>
                    <td>{FORMATS[a.format ?? ''] ?? a.format ?? '—'}</td>
                    <td className="whitespace-nowrap">{date(a.first_shown)}</td>
                    <td className="whitespace-nowrap">
                      {date(a.last_shown)} {live && <Badge tone="good">Activo</Badge>}
                    </td>
                    <td className="text-right">
                      {a.url && (
                        <a href={a.url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                          Ver anuncio
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
