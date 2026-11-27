import Link from 'next/link';
import type { EventRow } from '@/lib/queries';
import { EVENT_LABELS, dateTime, money, pct } from '@/lib/format';
import { Badge, BrandDot, Empty, Table } from './ui';

type V = Record<string, unknown> | null;
const n = (v: V, k: string) => (v && v[k] !== null && v[k] !== undefined ? Number(v[k]) : null);
const list = (v: V, k: string) => (v && Array.isArray(v[k]) ? (v[k] as string[]) : []);

const TONE: Record<string, 'good' | 'bad' | 'warn' | 'accent' | 'neutral'> = {
  new_product: 'accent',
  removed_product: 'neutral',
  discount_start: 'warn',
  discount_end: 'neutral',
  out_of_stock: 'bad',
  back_in_stock: 'good',
  promo_change: 'warn',
};

/** Texto del detalle del cambio. */
export function eventDetail(e: EventRow): string {
  const o = e.old_value;
  const v = e.new_value;
  switch (e.type) {
    case 'price_change': {
      const change = n(v, 'change_pct');
      return `${money(n(o, 'price'))} → ${money(n(v, 'price'))}${change !== null ? ` (${change > 0 ? '+' : ''}${pct(change, 1)})` : ''}`;
    }
    case 'discount_start':
      return `${money(n(v, 'price'))}, antes ${money(n(v, 'compare_at_price'))}${n(v, 'discount_pct') !== null ? ` (−${pct(n(v, 'discount_pct'), 1)})` : ''}`;
    case 'discount_end':
      return `Deja de mostrar precio tachado · ${money(n(v, 'price'))}`;
    case 'new_product':
      return v && v.price_from !== undefined ? `Desde ${money(n(v, 'price_from'))}${o && o.relisted ? ' · vuelve al catálogo' : ''}` : '';
    case 'promo_change': {
      const describe = (x: V) => {
        if (!x) return 'sin promoción';
        const p = n(x, 'main_discount_pct');
        const parts = [p !== null ? `${x.up_to ? 'hasta ' : ''}${pct(p)}` : 'sin descuento', ...list(x, 'campaigns'), ...list(x, 'codes').map((c) => `código ${c}`)];
        if (x.free_shipping) parts.push('envío gratis');
        return parts.join(' · ');
      };
      return `${describe(o)} → ${describe(v)}`;
    }
    default:
      return '';
  }
}

export function EventsTable({
  events,
  brandName,
  brandColor,
  productHref,
  showDate = true,
}: {
  events: EventRow[];
  brandName: (brandId: string) => string;
  brandColor: (brandId: string) => string;
  /** Enlace a la ficha del producto dentro del proyecto. */
  productHref: (productId: string) => string;
  showDate?: boolean;
}) {
  if (!events.length) return <Empty>No hay cambios en este periodo.</Empty>;
  return (
    <Table>
      <thead>
        <tr>
          {showDate && <th>Fecha</th>}
          <th>Marca</th>
          <th>Cambio</th>
          <th>Producto</th>
          <th>Detalle</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id}>
            {showDate && <td className="whitespace-nowrap text-ink-2">{dateTime(e.detected_at)}</td>}
            <td className="whitespace-nowrap">
              {e.site && (
                <span className="inline-flex items-center gap-1.5">
                  <BrandDot color={brandColor(e.site.brand_id)} />
                  {brandName(e.site.brand_id)}
                </span>
              )}
            </td>
            <td className="whitespace-nowrap">
              <Badge tone={TONE[e.type] ?? 'neutral'}>
                {EVENT_LABELS[e.type] ?? e.type}
              </Badge>
            </td>
            <td className="max-w-xs">
              {e.product ? (
                <Link href={productHref(e.product.id)} className="text-accent hover:underline">
                  {e.product.title}
                </Link>
              ) : (
                <span className="text-ink-3">Web completa</span>
              )}
              {e.variant?.title && <div className="truncate text-xs text-ink-3">{e.variant.title}</div>}
            </td>
            <td className="num text-ink-2">{eventDetail(e)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
