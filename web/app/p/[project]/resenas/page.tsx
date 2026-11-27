import Link from 'next/link';
import { Badge, BrandDot, Card, Empty, PageHeader, Table, buttonClass, inputClass } from '@/components/ui';
import { db, fetchAll, must } from '@/lib/db';
import { brandColors, date, num, pct } from '@/lib/format';
import { getProject } from '@/lib/project';

export const dynamic = 'force-dynamic';

interface SnapshotRow {
  site_id: string;
  captured_on: string;
  rating: number | null;
  reviews_count: number | null;
  profile_url: string | null;
}

interface ReviewRow {
  site_id: string;
  review_id: string;
  rating: number | null;
  title: string | null;
  body: string | null;
  author: string | null;
  published_at: string | null;
  replied: boolean;
  url: string | null;
}

const stars = (r: number | null) => (r === null ? '—' : `★ ${Number(r).toLocaleString('es-ES', { maximumFractionDigits: 1 })}`);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export default async function Resenas({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ marca?: string; notas?: string }>;
}) {
  const [{ project }, sp] = await Promise.all([params, searchParams]);
  const { brands, sites, path } = await getProject(project);
  const colors = brandColors(brands);
  const brandOfSite = new Map(sites.map((s) => [s.id, s.brand_id]));
  const siteIds = sites.filter((s) => s.active).map((s) => s.id);
  const since90 = new Date(Date.now() - 90 * 864e5).toISOString();
  const since30 = Date.now() - 30 * 864e5;

  const [snapshots, reviews] = siteIds.length
    ? await Promise.all([
        fetchAll<SnapshotRow>(
          (from, to) =>
            db()
              .from('review_snapshots')
              .select('site_id, captured_on, rating, reviews_count, profile_url')
              .eq('source', 'trustpilot')
              .in('site_id', siteIds)
              .order('captured_on', { ascending: false })
              .order('site_id')
              .range(from, to),
          'review_snapshots',
        ),
        fetchAll<ReviewRow>(
          (from, to) =>
            db()
              .from('reviews')
              .select('site_id, review_id, rating, title, body, author, published_at, replied, url')
              .eq('source', 'trustpilot')
              .in('site_id', siteIds)
              .gte('published_at', since90)
              .order('published_at', { ascending: false })
              .order('review_id')
              .range(from, to),
          'reviews',
        ),
      ])
    : [[], []];

  if (!snapshots.length && !reviews.length) {
    return (
      <>
        <PageHeader title="Reseñas" subtitle="Trustpilot vía DataForSEO" />
        <Card>
          <Empty>Todavía no hay datos. Lánzalos en GitHub: Actions → «Reseñas (Trustpilot vía DataForSEO)» → Run workflow.</Empty>
        </Card>
      </>
    );
  }

  // Por marca: última foto, foto de hace ~30 días (la más antigua dentro de la ventana si no hay) y reseñas de los últimos 30 días
  const rows = brands
    .map((b) => {
      const bSites = new Set(sites.filter((s) => s.brand_id === b.id).map((s) => s.id));
      const snaps = snapshots.filter((s) => bSites.has(s.site_id));
      const latest = snaps[0];
      const monthAgo = snaps.find((s) => new Date(`${s.captured_on}T12:00:00Z`).getTime() <= since30) ?? snaps.at(-1);
      const recent = reviews.filter((r) => bSites.has(r.site_id) && r.published_at && new Date(r.published_at).getTime() >= since30);
      const rated = recent.filter((r) => r.rating !== null).map((r) => Number(r.rating));
      return {
        brand: b,
        latest,
        monthAgo: monthAgo && monthAgo !== latest ? monthAgo : undefined,
        recent: recent.length,
        recentAvg: avg(rated),
        negative: rated.length ? (100 * rated.filter((r) => r <= 2).length) / rated.length : null,
        replied: recent.length ? (100 * recent.filter((r) => r.replied).length) / recent.length : null,
      };
    })
    .filter((r) => r.latest || r.recent)
    .sort((a, b) => (b.latest?.reviews_count ?? 0) - (a.latest?.reviews_count ?? 0));

  const selected = rows.find((r) => r.brand.id === sp.marca)?.brand;
  const negativesOnly = sp.notas === 'negativas';
  const list = reviews
    .filter((r) => !selected || brandOfSite.get(r.site_id) === selected.id)
    .filter((r) => !negativesOnly || (r.rating !== null && Number(r.rating) <= 2))
    .slice(0, 100);
  const lastDate = snapshots[0]?.captured_on;
  const sitesById = new Map(sites.map((s) => [s.id, s]));

  return (
    <>
      <PageHeader title="Reseñas" subtitle={`Trustpilot vía DataForSEO${lastDate ? ` · actualizado ${date(lastDate)}` : ''}`} />

      <Card title="Comparativa" className="mb-4">
        <Table>
          <thead>
            <tr>
              <th>Marca</th>
              <th className="text-right">Nota Trustpilot</th>
              <th className="text-right">Reseñas totales</th>
              <th className="text-right">Nuevas (30 días)</th>
              <th className="text-right">Nota últimos 30 días</th>
              <th className="text-right">Negativas (1–2★)</th>
              <th className="text-right">Respondidas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dRating = r.latest?.rating != null && r.monthAgo?.rating != null ? Number(r.latest.rating) - Number(r.monthAgo.rating) : null;
              const dCount = r.latest?.reviews_count != null && r.monthAgo?.reviews_count != null ? r.latest.reviews_count - r.monthAgo.reviews_count : null;
              return (
                <tr key={r.brand.id}>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <BrandDot color={colors[r.brand.id]} />
                      {r.latest?.profile_url ? (
                        <a href={r.latest.profile_url} target="_blank" rel="noreferrer" className="hover:underline">{r.brand.name}</a>
                      ) : (
                        r.brand.name
                      )}
                      {r.brand.is_own && <Badge tone="accent">Tu marca</Badge>}
                    </span>
                  </td>
                  <td className="num whitespace-nowrap text-right">
                    {stars(r.latest?.rating ?? null)}
                    {dRating !== null && Math.abs(dRating) >= 0.05 && (
                      <span className={`ml-1 text-xs ${dRating > 0 ? 'text-good' : 'text-bad'}`}>
                        {dRating > 0 ? '+' : ''}{dRating.toLocaleString('es-ES', { maximumFractionDigits: 1 })}
                      </span>
                    )}
                  </td>
                  <td className="num whitespace-nowrap text-right">
                    {num(r.latest?.reviews_count)}
                    {dCount !== null && dCount > 0 && <span className="ml-1 text-xs text-ink-3">+{num(dCount)}</span>}
                  </td>
                  <td className="num text-right">{num(r.recent)}</td>
                  <td className="num text-right">{stars(r.recentAvg)}</td>
                  <td className="num text-right">
                    {r.negative === null ? '—' : r.negative >= 20 ? <Badge tone="bad">{pct(r.negative)}</Badge> : pct(r.negative)}
                  </td>
                  <td className="num text-right">{pct(r.replied)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-ink-3">
          «Nuevas», «nota últimos 30 días», «negativas» y «respondidas» se calculan con las reseñas recientes leídas en cada actualización (las 100 más
          recientes por marca). Las variaciones comparan con la foto de hace unos 30 días, cuando la hay.
        </p>
      </Card>

      <Card
        title="Últimas reseñas"
        right={
          <form className="flex flex-wrap gap-2">
            <select name="marca" defaultValue={selected?.id ?? ''} className={inputClass}>
              <option value="">Todas las marcas</option>
              {rows.map((r) => (
                <option key={r.brand.id} value={r.brand.id}>{r.brand.name}</option>
              ))}
            </select>
            <select name="notas" defaultValue={negativesOnly ? 'negativas' : ''} className={inputClass}>
              <option value="">Todas las notas</option>
              <option value="negativas">Solo negativas (1–2★)</option>
            </select>
            <button className={buttonClass}>Filtrar</button>
          </form>
        }
      >
        {list.length === 0 ? (
          <Empty>No hay reseñas con estos filtros en los últimos 90 días.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((r) => {
              const brandId = brandOfSite.get(r.site_id) ?? '';
              const brand = brands.find((b) => b.id === brandId);
              const tone = r.rating === null ? 'neutral' : Number(r.rating) >= 4 ? 'good' : Number(r.rating) <= 2 ? 'bad' : 'warn';
              return (
                <li key={`${r.site_id}-${r.review_id}`} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={tone}>{stars(r.rating)}</Badge>
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <BrandDot color={colors[brandId] ?? '#8a93a6'} />
                      {brand?.name ?? sitesById.get(r.site_id)?.base_url}
                    </span>
                    <span className="text-xs text-ink-3">
                      {date(r.published_at)}
                      {r.author ? ` · ${r.author}` : ''}
                    </span>
                    {r.replied && <Badge>Respondida</Badge>}
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer" className="ml-auto text-xs text-accent hover:underline">
                        Ver en Trustpilot
                      </a>
                    )}
                  </div>
                  {r.title && <div className="mt-1 font-medium">{r.title}</div>}
                  {r.body && <p className="mt-0.5 line-clamp-3 text-ink-2">{r.body}</p>}
                </li>
              );
            })}
          </ul>
        )}
        {selected && (
          <p className="mt-3 text-xs">
            <Link href={path('/resenas')} className="text-accent hover:underline">Ver todas las marcas</Link>
          </p>
        )}
      </Card>
    </>
  );
}
