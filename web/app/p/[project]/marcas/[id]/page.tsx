import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, BrandDot, Card, Empty, PageHeader, Stat, Table, buttonClass, inputClass } from '@/components/ui';
import { db, must } from '@/lib/db';
import { brandColors, date, money, num, pct } from '@/lib/format';
import { getProject } from '@/lib/project';
import { PRODUCT_TYPES, productType } from '@/lib/categories';

export const dynamic = 'force-dynamic';

interface ProductSummary {
  id: string;
  title: string;
  url: string;
  category: string | null;
  rating: number | null;
  review_count: number | null;
  first_seen_at: string;
  removed_at: string | null;
  captured_on: string | null;
  variants: number;
  min_price: number | null;
  max_price: number | null;
  discounted_variants: number;
  max_discount_pct: number | null;
  out_of_stock_variants: number;
}

export default async function BrandCatalog({
  params,
  searchParams,
}: {
  params: Promise<{ project: string; id: string }>;
  searchParams: Promise<{ q?: string; tipo?: string; retirados?: string }>;
}) {
  const [{ project, id }, { q = '', tipo = '', retirados }] = await Promise.all([params, searchParams]);
  const { brands, path } = await getProject(project);
  const brand = brands.find((b) => b.id === id);
  if (!brand) notFound();
  const colors = brandColors(brands);

  const all = (
    must(await db().from('v_product_summary').select('*').eq('brand_id', id).order('title'), 'products') as ProductSummary[]
  ).map((p) => ({ ...p, type: productType(p.title, p.category) }));
  const active = all.filter((p) => !p.removed_at);
  const removed = all.filter((p) => p.removed_at);
  const types = PRODUCT_TYPES.filter((t) => active.some((p) => p.type === t));
  const needle = q.trim().toLowerCase();
  const shown = (retirados ? removed : active).filter(
    (p) => (!needle || p.title.toLowerCase().includes(needle)) && (!tipo || p.type === tipo),
  );
  // "Nuevo": aparecido en los últimos 7 días, pero no en la primera captura de la marca (que es el punto de partida)
  const weekAgo = Date.now() - 7 * 864e5;
  const baselineDay = all.length ? Math.min(...all.map((p) => new Date(p.first_seen_at).getTime())) + 864e5 : 0;
  const isNew = (p: ProductSummary) => {
    const t = new Date(p.first_seen_at).getTime();
    return !p.removed_at && t > weekAgo && t > baselineDay;
  };

  return (
    <>
      <PageHeader
        title={brand.name}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <BrandDot color={colors[brand.id]} />
            {brand.is_own ? 'Tu marca' : 'Competidor'} · catálogo actual
          </span>
        }
        actions={
          <Link href={path('/marcas')} className={buttonClass}>
            Gestionar webs
          </Link>
        }
      />

      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat label="Productos" value={num(brand.products)} />
          <Stat label="Variantes" value={num(brand.variants)} />
          <Stat label="Con precio tachado" value={pct(brand.variants ? (100 * brand.discounted_variants) / brand.variants : null)} />
          <Stat label="Variantes sin stock" value={num(brand.out_of_stock_variants)} />
          <Stat label="Nota media" value={brand.avg_rating ? `★ ${Number(brand.avg_rating).toLocaleString('es-ES')}` : '—'} hint={brand.reviews ? `${num(brand.reviews)} reseñas` : undefined} />
        </div>
      </Card>

      <Card>
        <form className="mb-4 flex flex-wrap gap-2">
          <input name="q" defaultValue={q} placeholder="Buscar producto" className={`${inputClass} w-64`} />
          <select name="tipo" defaultValue={tipo} className={inputClass}>
            <option value="">Todos los tipos</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t} ({active.filter((p) => p.type === t).length})
              </option>
            ))}
          </select>
          {retirados && <input type="hidden" name="retirados" value="1" />}
          <button className={buttonClass}>Filtrar</button>
          <Link href={retirados ? `/marcas/${id}` : `/marcas/${id}?retirados=1`} className="ml-auto self-center text-sm text-accent hover:underline">
            {retirados ? `Ver catálogo actual (${active.length})` : `Ver retirados (${removed.length})`}
          </Link>
        </form>
        {shown.length === 0 ? (
          <Empty>No hay productos con estos filtros.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Tipo</th>
                <th>Categoría en la web</th>
                <th className="text-right">Variantes</th>
                <th className="text-right">Precio</th>
                <th className="text-right">Tachado</th>
                <th className="text-right">Sin stock</th>
                <th className="text-right">Nota</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td className="max-w-sm">
                    <Link href={path(`/productos/${p.id}`)} className="text-accent hover:underline">
                      {p.title}
                    </Link>
                    {isNew(p) && <span className="ml-2"><Badge tone="accent">Nuevo</Badge></span>}
                    {p.removed_at && <div className="text-xs text-ink-3">Retirado el {date(p.removed_at)}</div>}
                  </td>
                  <td className="whitespace-nowrap">{p.type}</td>
                  <td className="text-ink-2">{p.category ?? '—'}</td>
                  <td className="num text-right">{num(p.variants)}</td>
                  <td className="num whitespace-nowrap text-right">
                    {p.min_price === null ? '—' : p.min_price === p.max_price ? money(p.min_price) : `${money(p.min_price)} – ${money(p.max_price)}`}
                  </td>
                  <td className="num text-right">{p.discounted_variants ? `hasta −${pct(p.max_discount_pct)}` : '—'}</td>
                  <td className="num text-right">{p.out_of_stock_variants ? <Badge tone="bad">{p.out_of_stock_variants}</Badge> : '—'}</td>
                  <td className="num whitespace-nowrap text-right">{p.rating ? `★ ${Number(p.rating).toLocaleString('es-ES')} (${num(p.review_count)})` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
