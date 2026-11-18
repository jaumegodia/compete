import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EventsTable } from '@/components/events';
import { PriceChart, type PricePoint } from '@/components/price-chart';
import { Badge, BrandDot, Card, PageHeader, Table } from '@/components/ui';
import { productType } from '@/lib/categories';
import { db, must } from '@/lib/db';
import { brandColors, date, money, num, pct } from '@/lib/format';
import { getBrands, type EventRow } from '@/lib/queries';

export const dynamic = 'force-dynamic';

interface Variant {
  id: string;
  title: string | null;
  sku: string | null;
  size: string | null;
  removed_at: string | null;
  current_price: number | null;
  current_compare_at_price: number | null;
  current_available: boolean | null;
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const [{ id }, { v: selected }] = await Promise.all([params, searchParams]);
  const product = must(
    await db()
      .from('products')
      .select('id, title, url, category, vendor, image_url, description, rating, review_count, first_seen_at, removed_at, site:sites(brand_id, base_url)')
      .eq('id', id)
      .maybeSingle(),
    'product',
  ) as unknown as {
    id: string; title: string; url: string; category: string | null; image_url: string | null; description: string | null;
    rating: number | null; review_count: number | null; first_seen_at: string; removed_at: string | null;
    site: { brand_id: string; base_url: string };
  } | null;
  if (!product) notFound();

  const [brands, variants, events] = await Promise.all([
    getBrands(),
    db()
      .from('variants')
      .select('id, title, sku, size, removed_at, current_price, current_compare_at_price, current_available')
      .eq('product_id', id)
      .order('current_price', { ascending: true })
      .then((r) => must(r, 'variants') as Variant[]),
    db()
      .from('events')
      .select('id, type, old_value, new_value, detected_at, product:products(id, title, url), variant:variants(title, size), site:sites(id, base_url, brand_id)')
      .eq('product_id', id)
      .order('detected_at', { ascending: false })
      .limit(100)
      .then((r) => must(r, 'events') as unknown as EventRow[]),
  ]);
  const brand = brands.find((b) => b.id === product.site.brand_id);
  const colors = brandColors(brands);
  const activeVariants = variants.filter((x) => !x.removed_at);
  const chosen = activeVariants.find((x) => x.id === selected) ?? null;

  // Histórico: la variante elegida o, por defecto, el precio mínimo del producto cada día
  const ids = chosen ? [chosen.id] : activeVariants.map((x) => x.id);
  const snapshots = ids.length
    ? (must(
        await db()
          .from('price_snapshots')
          .select('variant_id, captured_on, price, compare_at_price')
          .in('variant_id', ids.slice(0, 300))
          .order('captured_on')
          .limit(20000),
        'snapshots',
      ) as { variant_id: string; captured_on: string; price: number | null; compare_at_price: number | null }[])
    : [];
  const byDay = new Map<string, PricePoint>();
  for (const s of snapshots) {
    const price = s.price === null ? null : Number(s.price);
    const cur = byDay.get(s.captured_on);
    if (!cur || (price !== null && (cur.price === null || price < cur.price))) {
      byDay.set(s.captured_on, { date: s.captured_on, price, compareAt: s.compare_at_price === null ? null : Number(s.compare_at_price) });
    }
  }
  const series = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <PageHeader
        title={product.title}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {brand && (
              <Link href={`/marcas/${brand.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                <BrandDot color={colors[brand.id]} />
                {brand.name}
              </Link>
            )}
            <span>· {productType(product.title, product.category)}</span>
            {product.category && <span className="text-ink-3">({product.category} en la web)</span>}
            <span>· visto por primera vez el {date(product.first_seen_at)}</span>
            {product.removed_at && <Badge tone="bad">Retirado el {date(product.removed_at)}</Badge>}
          </span>
        }
        actions={
          <a href={product.url} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">
            Ver en la web ↗
          </a>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title={chosen ? `Precio de ${chosen.title ?? chosen.sku ?? 'la variante'}` : 'Precio mínimo del producto'}>
          <PriceChart data={series} label={chosen?.title ?? 'precio mínimo'} />
        </Card>
        <Card title="Ficha">
          {product.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image_url} alt="" className="mb-3 aspect-[4/3] w-full rounded-md bg-[#f1f0ec] object-cover" />
          )}
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-ink-2">Variantes</dt>
            <dd className="num">{num(activeVariants.length)}</dd>
            <dt className="text-ink-2">Valoración</dt>
            <dd className="num">{product.rating ? `★ ${Number(product.rating).toLocaleString('es-ES')} (${num(product.review_count)})` : '—'}</dd>
          </dl>
          {product.description && <p className="mt-3 line-clamp-6 text-sm text-ink-2">{product.description}</p>}
        </Card>
      </div>

      <Card title="Variantes" className="mt-4" right={chosen && <Link href={`/productos/${id}`} className="text-xs text-accent hover:underline">Ver precio mínimo</Link>}>
        <Table>
          <thead>
            <tr>
              <th>Variante</th>
              <th>Medida</th>
              <th>SKU</th>
              <th className="text-right">Precio</th>
              <th className="text-right">Tachado</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {activeVariants.map((x) => {
              const disc = x.current_compare_at_price && x.current_price ? (100 * (x.current_compare_at_price - x.current_price)) / x.current_compare_at_price : null;
              return (
                <tr key={x.id} className={x.id === chosen?.id ? 'bg-[#eef4fc]' : ''}>
                  <td>
                    <Link href={`/productos/${id}?v=${x.id}`} className="text-accent hover:underline">
                      {x.title ?? 'Única'}
                    </Link>
                  </td>
                  <td className="text-ink-2">{x.size ?? '—'}</td>
                  <td className="text-ink-3">{x.sku ?? '—'}</td>
                  <td className="num text-right">{money(x.current_price)}</td>
                  <td className="num text-right text-ink-2">{x.current_compare_at_price ? `${money(x.current_compare_at_price)} (−${pct(disc)})` : '—'}</td>
                  <td>{x.current_available === false ? <Badge tone="bad">Sin stock</Badge> : x.current_available ? <Badge tone="good">Disponible</Badge> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card title="Cambios de este producto" className="mt-4">
        <EventsTable events={events} brandName={(b) => brands.find((x) => x.id === b)?.name ?? '—'} brandColor={(b) => colors[b] ?? '#8a8a85'} />
      </Card>
    </>
  );
}
