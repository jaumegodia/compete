import type { ScrapedVariant } from './types.js';

export interface Snapshot {
  variant_id: string;
  captured_on: string;
  price: number | string | null;
  compare_at_price: number | string | null;
  available: boolean | null;
}

export type EventType =
  | 'new_product'
  | 'removed_product'
  | 'price_change'
  | 'discount_start'
  | 'discount_end'
  | 'out_of_stock'
  | 'back_in_stock'
  | 'promo_change';

export interface EventDraft {
  type: EventType;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
}

const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** Compara el último snapshot guardado de una variante con lo capturado hoy. */
export function computeVariantEvents(prev: Snapshot | undefined, curr: ScrapedVariant): EventDraft[] {
  if (!prev) return []; // variante nueva: sin histórico con el que comparar
  const events: EventDraft[] = [];
  const oldPrice = num(prev.price);
  const oldCompare = num(prev.compare_at_price);

  if (oldPrice !== null && curr.price !== null && Math.abs(oldPrice - curr.price) >= 0.01) {
    events.push({
      type: 'price_change',
      old_value: { price: oldPrice },
      new_value: { price: curr.price, change_pct: Math.round(((curr.price - oldPrice) / oldPrice) * 1000) / 10 },
    });
  }

  const hadDiscount = oldCompare !== null;
  const hasDiscount = curr.compareAtPrice !== null;
  if (!hadDiscount && hasDiscount) {
    events.push({
      type: 'discount_start',
      old_value: { price: oldPrice },
      new_value: { price: curr.price, compare_at_price: curr.compareAtPrice, discount_pct: discountPct(curr) },
    });
  } else if (hadDiscount && !hasDiscount) {
    events.push({
      type: 'discount_end',
      old_value: { price: oldPrice, compare_at_price: oldCompare },
      new_value: { price: curr.price },
    });
  }

  if (prev.available === true && curr.available === false) {
    events.push({ type: 'out_of_stock', old_value: { available: true }, new_value: { available: false } });
  } else if (prev.available === false && curr.available === true) {
    events.push({ type: 'back_in_stock', old_value: { available: false }, new_value: { available: true } });
  }
  return events;
}

export function discountPct(v: Pick<ScrapedVariant, 'price' | 'compareAtPrice'>): number | null {
  if (v.price === null || v.compareAtPrice === null || v.compareAtPrice <= 0) return null;
  return Math.round(((v.compareAtPrice - v.price) / v.compareAtPrice) * 1000) / 10;
}

/**
 * Seguridad antes de dar productos por retirados: si una captura trae muchos menos productos que los
 * activos (bloqueo, error de la web…), no se marca nada como retirado.
 */
export function safeToMarkRemoved(activeBefore: number, scrapedNow: number, minRatio = 0.5): boolean {
  if (activeBefore === 0) return true;
  return scrapedNow >= activeBefore * minRatio;
}
