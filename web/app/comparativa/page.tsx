import Link from 'next/link';
import { Badge, BrandDot, Card, Empty, PageHeader, Table, buttonClass, inputClass } from '@/components/ui';
import { db, must } from '@/lib/db';
import { brandColors, diffPct, money, pct } from '@/lib/format';
import { getBrands, getCompetitorLinks, getSites } from '@/lib/queries';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  size: string;
  current_price: number | null;
  current_compare_at_price: number | null;
  current_available: boolean | null;
  product: { id: string; title: string; removed_at: string | null; site: { brand_id: string } };
}

export default async function Comparativa({
  searchParams,
}: {
  searchParams: Promise<{ marca?: string; medida?: string; q?: string; packs?: string }>;
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

  // Medidas disponibles en tu marca, ordenadas por número de productos que la tienen
  const sizesRaw = must(
    await db()
      .from('variants')
      .select('size, product:products!inner(id, removed_at, site_id, site:sites(brand_id))')
      .not('size', 'is', null)
      .is('removed_at', null)
      .is('product.removed_at', null)
      .in('product.site_id', siteIds)
      .limit(20000),
    'sizes',
  ) as unknown as { size: string; product: { id: string; site: { brand_id: string } } }[];
  const productsBySize = new Map<string, Set<string>>();
  const ownSizes = new Set<string>();
  for (const r of sizesRaw) {
    if (!productsBySize.has(r.size)) productsBySize.set(r.size, new Set());
    productsBySize.get(r.size)!.add(r.product.id);
    if (r.product.site.brand_id === brand.id) ownSizes.add(r.size);
  }
  const sizes = [...ownSizes].sort((a, b) => (productsBySize.get(b)?.size ?? 0) - (productsBySize.get(a)?.size ?? 0));
  const size = sp.medida && productsBySize.has(sp.medida) ? sp.medida : sizes[0];
  const includePacks = sp.packs === '1';
  const q = (sp.q ?? '').trim().toLowerCase();

  const rows = size
    ? (must(
        await db()
          .from('variants')
          .select('id, size, current_price, current_compare_at_price, current_available, product:products!inner(id, title, removed_at, site_id, site:sites(brand_id))')
          .eq('size', size)
          .is('removed_at', null)
          .is('product.removed_at', null)
          .in('product.site_id', siteIds)
          .limit(5000),
        'rows',
      ) as unknown as Row[])
    : [];

  // Una fila por producto: la variante más barata de esa medida
  const byProduct = new Map<string, Row>();
  for (const r of rows) {
    if (r.current_price === null) continue;
    if (!includePacks && /\bpack\b/i.test(r.product.title)) continue;
    if (q && !r.product.title.toLowerCase().includes(q)) continue;
    const cur = byProduct.get(r.product.id);
    if (!cur || Number(r.current_price) < Number(cur.current_price)) byProduct.set(r.product.id, r);
  }
  const list = [...byProduct.values()].sort((a, b) => Number(a.current_price) - Number(b.current_price));
  const max = Math.max(1, ...list.map((r) => Number(r.current_compare_at_price ?? r.current_price)));
  const ownRows = list.filter((r) => r.product.site.brand_id === brand.id);

  // Para cada producto de la competencia, el producto propio más cercano en precio
  const nearestOwn = (price: number) =>
    ownRows.reduce<Row | null>((best, r) => (!best || Math.abs(Number(r.current_price) - price) < Math.abs(Number(best.current_price) - price) ? r : best), null);

  return (
    <>
      <PageHeader title="Comparativa de precios" subtitle={`${brand.name} frente a ${brandIds.length - 1} competidores, en la misma medida`} />

      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-3">
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
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Medida
            <select name="medida" defaultValue={size} className={inputClass}>
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s} ({productsBySize.get(s)?.size} productos)
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Producto contiene
            <input name="q" defaultValue={sp.q ?? ''} placeholder="colchón, almohada…" className={inputClass} />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink-2">
            <input type="checkbox" name="packs" value="1" defaultChecked={includePacks} /> Incluir packs
          </label>
          <button className={buttonClass}>Comparar</button>
          <div className="ml-auto flex flex-wrap gap-3 pb-2 text-xs text-ink-2">
            {brandIds.filter((id) => list.some((r) => r.product.site.brand_id === id)).map((id) => (
              <span key={id} className="inline-flex items-center gap-1.5">
                <BrandDot color={colors[id]} />
                {name(id)}
              </span>
            ))}
          </div>
        </form>
      </Card>

      <Card title={size ? `Precio actual en ${size} · ${list.length} productos, de más barato a más caro` : 'Comparativa'}>
        {!list.length ? (
          <Empty>No hay productos con esta medida y estos filtros.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Marca</th>
                <th>Producto</th>
                <th className="w-[34%]">Precio</th>
                <th className="text-right">Tachado</th>
                <th className="text-right">Frente a tu producto más cercano</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const bId = r.product.site.brand_id;
                const isOwn = bId === brand.id;
                const price = Number(r.current_price);
                const compare = r.current_compare_at_price === null ? null : Number(r.current_compare_at_price);
                const near = isOwn ? null : nearestOwn(price);
                const d = near ? diffPct(price, Number(near.current_price)) : null;
                return (
                  <tr key={r.id} className={isOwn ? 'bg-[#eef4fc]' : ''}>
                    <td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <BrandDot color={colors[bId]} />
                        {name(bId)}
                      </span>
                    </td>
                    <td className="max-w-xs">
                      <Link href={`/productos/${r.product.id}?v=${r.id}`} className="text-accent hover:underline">
                        {r.product.title}
                      </Link>
                      {r.current_available === false && <span className="ml-2"><Badge tone="bad">Sin stock</Badge></span>}
                    </td>
                    <td>
                      <div className="flex items-center gap-2" title={`${money(price)}${compare ? ` · antes ${money(compare)}` : ''}`}>
                        <div className="relative h-3 flex-1">
                          {compare && <div className="absolute inset-y-0 left-0 rounded-r border border-dashed border-ink-3" style={{ width: `${(100 * compare) / max}%` }} />}
                          <div className="absolute inset-y-0 left-0 rounded-r" style={{ width: `${(100 * price) / max}%`, background: colors[bId] }} />
                        </div>
                        <span className="num w-20 text-right font-medium">{money(price)}</span>
                      </div>
                    </td>
                    <td className="num text-right text-ink-2">{compare ? `${money(compare)} (−${pct((100 * (compare - price)) / compare)})` : '—'}</td>
                    <td className="num text-right text-ink-2">
                      {near ? (
                        <span title={near.product.title}>
                          {d !== null && d > 0 ? '+' : ''}
                          {pct(d, 1)} vs {near.product.title.length > 28 ? `${near.product.title.slice(0, 28)}…` : near.product.title}
                        </span>
                      ) : isOwn ? (
                        <Badge tone="accent">Tu producto</Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <p className="mt-3 text-xs text-ink-3">
          La barra muestra el precio de venta; el contorno discontinuo, el precio tachado si la web lo publica. La comparación con
          &quot;tu producto más cercano&quot; es por precio, no por características.
        </p>
      </Card>
    </>
  );
}
