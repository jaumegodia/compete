import Link from 'next/link';
import { Badge, BrandDot, Card, Empty, PageHeader, Table, buttonClass, inputClass } from '@/components/ui';
import { PRODUCT_TYPES, productType, type ProductType } from '@/lib/categories';
import { db, fetchAll } from '@/lib/db';
import { brandColors, diffPct, money, pct } from '@/lib/format';
import { getBrands, getCompetitorLinks, getSites } from '@/lib/queries';

export const dynamic = 'force-dynamic';

interface VariantRow {
  id: string;
  size: string | null;
  current_price: number | null;
  current_compare_at_price: number | null;
  current_available: boolean | null;
  product: { id: string; title: string; category: string | null; site: { brand_id: string } };
}
type Row = VariantRow & { type: ProductType; brandId: string; price: number };

const ALL = 'todos';
const ANY_SIZE = 'todas';

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export default async function Comparativa({
  searchParams,
}: {
  searchParams: Promise<{ marca?: string; tipo?: string; medida?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const [brands, links, sites] = await Promise.all([getBrands(), getCompetitorLinks(), getSites()]);
  const own = brands.filter((b) => b.is_own);
  const brand = own.find((b) => b.id === sp.marca) ?? own[0];
  if (!brand) {
    return (
      <>
        <PageHeader title="Comparativa" />
        <Card>
          <Empty>Marca una de tus marcas como propia en Marcas y webs para comparar.</Empty>
        </Card>
      </>
    );
  }
  const colors = brandColors(brands);
  const brandIds = [brand.id, ...links.filter((l) => l.brand_id === brand.id).map((l) => l.competitor_id)];
  const name = (id: string) => brands.find((b) => b.id === id)?.name ?? '—';
  const siteIds = sites.filter((s) => brandIds.includes(s.brand_id)).map((s) => s.id);

  // Todas las variantes activas de tu marca y sus competidores (son pocos miles: se filtra en memoria)
  const raw = (await fetchAll(
    (from, to) =>
      db()
      .from('variants')
      .select(
        'id, size, current_price, current_compare_at_price, current_available, product:products!inner(id, title, category, removed_at, site_id, site:sites(brand_id))',
      )
      .not('current_price', 'is', null)
      .is('removed_at', null)
      .is('product.removed_at', null)
      .in('product.site_id', siteIds)
      .order('id')
      .range(from, to),
    'variants',
  )) as unknown as VariantRow[];
  const all: Row[] = raw.map((r) => ({
    ...r,
    type: productType(r.product.title, r.product.category),
    brandId: r.product.site.brand_id,
    price: Number(r.current_price),
  }));

  // Tipos en los que tienes productos, con cuántos productos hay en total
  const productsOf = (rows: Row[]) => new Set(rows.map((r) => r.product.id)).size;
  const types = PRODUCT_TYPES.filter((t) => t !== 'Otros' && all.some((r) => r.type === t && r.brandId === brand.id));
  const defaultType: string = types.includes('Colchones') ? 'Colchones' : (types[0] ?? ALL);
  const tipo = sp.tipo === ALL || types.includes(sp.tipo as ProductType) ? (sp.tipo as string) : defaultType;
  const ofType = tipo === ALL ? all : all.filter((r) => r.type === tipo);

  // Medidas que tienes en ese tipo, ordenadas por número de productos (tuyos y de la competencia)
  const bySize = new Map<string, Row[]>();
  for (const r of ofType) if (r.size) bySize.set(r.size, [...(bySize.get(r.size) ?? []), r]);
  const sizes = [...bySize.keys()]
    .filter((s) => bySize.get(s)!.some((r) => r.brandId === brand.id))
    .sort((a, b) => productsOf(bySize.get(b)!) - productsOf(bySize.get(a)!) || a.localeCompare(b, 'es', { numeric: true }));
  // Por defecto, la medida con más productos si en ella hay competencia; si no (almohadas, sofás…), todas las medidas
  const competed = (s: string) => bySize.get(s)!.some((r) => r.brandId !== brand.id);
  // y si esa medida reúne al menos la mitad de los productos del tipo (en almohadas cada web mide distinto)
  const best = sizes.find(competed);
  const defaultSize = best && productsOf(bySize.get(best)!) * 2 >= productsOf(ofType) ? best : ANY_SIZE;
  const size = sp.medida === ANY_SIZE || (sp.medida && sizes.includes(sp.medida)) ? sp.medida : defaultSize;
  const anySize = size === ANY_SIZE;
  const sizeLabel = anySize ? 'todas las medidas' : size;
  const q = (sp.q ?? '').trim().toLowerCase();

  // Una fila por producto: su variante más barata en esa medida (o en cualquiera)
  const byProduct = new Map<string, Row>();
  for (const r of anySize ? ofType : (bySize.get(size) ?? [])) {
    if (q && !r.product.title.toLowerCase().includes(q)) continue;
    const cur = byProduct.get(r.product.id);
    if (!cur || r.price < cur.price) byProduct.set(r.product.id, r);
  }
  const list = [...byProduct.values()].sort((a, b) => a.price - b.price);
  const max = Math.max(1, ...list.map((r) => Number(r.current_compare_at_price ?? r.price)));
  const ownRows = list.filter((r) => r.brandId === brand.id);

  // Tu producto más cercano en precio, siempre del mismo tipo
  const nearestOwn = (r: Row) =>
    ownRows
      .filter((o) => o.type === r.type)
      .reduce<Row | null>((best, o) => (!best || Math.abs(o.price - r.price) < Math.abs(best.price - r.price) ? o : best), null);

  // Resumen por marca en este tipo y medida
  const ownMedian = median(ownRows.map((r) => r.price));
  const summary = brandIds
    .map((id) => {
      const prices = list.filter((r) => r.brandId === id).map((r) => r.price);
      return { id, n: prices.length, min: prices.length ? Math.min(...prices) : null, med: median(prices) };
    })
    .filter((s) => s.n);

  const href = (params: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const merged = { marca: own.length > 1 ? brand.id : undefined, tipo, medida: size, q: sp.q, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    return `/comparativa?${u}`;
  };
  const typeLabel = tipo === ALL ? 'todos los tipos' : tipo.toLowerCase();

  return (
    <>
      <PageHeader
        title="Comparativa de precios"
        subtitle={`${brand.name} frente a ${brandIds.length - 1} competidores: mismo tipo de producto y misma medida`}
      />

      <Card className="mb-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {[...types, ALL].map((t) => {
            const n = productsOf(t === ALL ? all : all.filter((r) => r.type === t));
            const active = t === tipo;
            return (
              <Link
                key={t}
                href={href({ tipo: t, medida: undefined })}
                className={`rounded-full border px-3 py-1 text-sm ${active ? 'border-accent bg-accent text-white' : 'border-line text-ink-2 hover:border-ink-3'}`}
              >
                {t === ALL ? 'Todos' : t} <span className={active ? 'opacity-80' : 'text-ink-3'}>{n}</span>
              </Link>
            );
          })}
        </div>
        {/* key: al navegar entre pestañas el formulario se vuelve a crear y muestra la medida real */}
        <form key={`${brand.id}|${tipo}|${size}|${sp.q ?? ''}`} className="flex flex-wrap items-end gap-3">
          {own.length > 1 && (
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Marca
              <select name="marca" defaultValue={brand.id} className={inputClass}>
                {own.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <input type="hidden" name="tipo" value={tipo} />
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Medida
            <select name="medida" defaultValue={size} className={inputClass}>
              <option value={ANY_SIZE}>Todas las medidas ({productsOf(ofType)} productos)</option>
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s} ({productsOf(bySize.get(s)!)} productos)
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Producto contiene
            <input name="q" defaultValue={sp.q ?? ''} placeholder="híbrido, visco…" className={inputClass} />
          </label>
          <button className={buttonClass}>Comparar</button>
        </form>
      </Card>

      {summary.length > 0 && (
        <Card className="mb-4" title={`Resumen: ${typeLabel} en ${sizeLabel}`}>
          <Table>
            <thead>
              <tr>
                <th>Marca</th>
                <th className="text-right">Productos</th>
                <th className="text-right">Desde</th>
                <th className="text-right">Precio mediano</th>
                <th className="text-right">Mediana frente a la tuya</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => {
                const isOwn = s.id === brand.id;
                const d = !isOwn && s.med !== null && ownMedian !== null ? diffPct(s.med, ownMedian) : null;
                return (
                  <tr key={s.id} className={isOwn ? 'bg-[#eef4fc]' : ''}>
                    <td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <BrandDot color={colors[s.id]} />
                        {name(s.id)}
                      </span>
                    </td>
                    <td className="num text-right">{s.n}</td>
                    <td className="num text-right">{money(s.min)}</td>
                    <td className="num text-right font-medium">{money(s.med)}</td>
                    <td className="num text-right text-ink-2">
                      {isOwn ? <Badge tone="accent">Tu marca</Badge> : d === null ? '—' : `${d > 0 ? '+' : ''}${pct(d, 1)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      <Card title={`${tipo === ALL ? 'Todos los productos' : tipo} en ${sizeLabel} · ${list.length} productos, de más barato a más caro`}>
        {!list.length ? (
          <Empty>No hay productos de este tipo con esta medida y estos filtros.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Marca</th>
                <th>Producto</th>
                <th className="w-[30%]">Precio</th>
                <th className="text-right">Tachado</th>
                <th className="text-right">Frente a tu {tipo === ALL ? 'producto del mismo tipo' : 'producto'} más cercano</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const isOwn = r.brandId === brand.id;
                const compare = r.current_compare_at_price === null ? null : Number(r.current_compare_at_price);
                const near = isOwn ? null : nearestOwn(r);
                const d = near ? diffPct(r.price, near.price) : null;
                return (
                  <tr key={r.id} className={isOwn ? 'bg-[#eef4fc]' : ''}>
                    <td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <BrandDot color={colors[r.brandId]} />
                        {name(r.brandId)}
                      </span>
                    </td>
                    <td className="max-w-xs">
                      <Link href={`/productos/${r.product.id}?v=${r.id}`} className="text-accent hover:underline">
                        {r.product.title}
                      </Link>
                      {(tipo === ALL || anySize) && (
                        <div className="text-xs text-ink-3">{[tipo === ALL ? r.type : null, anySize ? (r.size ?? 'sin medida') : null].filter(Boolean).join(' · ')}</div>
                      )}
                      {r.current_available === false && <span className="ml-2"><Badge tone="bad">Sin stock</Badge></span>}
                    </td>
                    <td>
                      <div className="flex items-center gap-2" title={`${money(r.price)}${compare ? ` · antes ${money(compare)}` : ''}`}>
                        <div className="relative h-3 flex-1">
                          {compare && <div className="absolute inset-y-0 left-0 rounded-r border border-dashed border-ink-3" style={{ width: `${(100 * compare) / max}%` }} />}
                          <div className="absolute inset-y-0 left-0 rounded-r" style={{ width: `${(100 * r.price) / max}%`, background: colors[r.brandId] }} />
                        </div>
                        <span className="num w-20 text-right font-medium">{money(r.price)}</span>
                      </div>
                    </td>
                    <td className="num text-right text-ink-2">{compare ? `${money(compare)} (−${pct((100 * (compare - r.price)) / compare)})` : '—'}</td>
                    <td className="num text-right text-ink-2">
                      {isOwn ? (
                        <Badge tone="accent">Tu producto</Badge>
                      ) : near ? (
                        <span title={near.product.title}>
                          {d !== null && d > 0 ? '+' : ''}
                          {pct(d, 1)} vs {near.product.title.length > 28 ? `${near.product.title.slice(0, 28)}…` : near.product.title}
                        </span>
                      ) : (
                        <span className="text-ink-3">Sin producto tuyo de este tipo</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <p className="mt-3 text-xs text-ink-3">
          El tipo de producto se deduce del nombre y de la categoría que publica cada web. La barra muestra el precio de venta; el
          contorno discontinuo, el precio tachado si la web lo publica. Con &quot;todas las medidas&quot; se toma la variante más barata
          de cada producto, así que solo es orientativo. &quot;Tu producto más cercano&quot; es el tuyo del mismo tipo
          con el precio más parecido, no por características.
        </p>
      </Card>
    </>
  );
}
