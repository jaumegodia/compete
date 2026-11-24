export const TZ = 'Europe/Madrid';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('es-ES');

export const money = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === '' ? '—' : eur.format(Number(v));
export const num = (v: number | string | null | undefined) =>
  v === null || v === undefined ? '—' : int.format(Number(v));
export const pct = (v: number | string | null | undefined, digits = 0) =>
  v === null || v === undefined ? '—' : `${Number(v).toLocaleString('es-ES', { maximumFractionDigits: digits })}%`;

export const date = (v: string | Date | null | undefined) =>
  v ? new Date(typeof v === 'string' && v.length === 10 ? `${v}T12:00:00Z` : v).toLocaleDateString('es-ES', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const dateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('es-ES', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** Fecha de hoy (AAAA-MM-DD) en hora de Madrid. */
export const todayMadrid = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });

export const shiftDay = (d: string, days: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
};

/** Diferencia en % de a respecto a b. */
export const diffPct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);

/**
 * Color fijo por marca (paleta categórica validada, en orden fijo): la marca propia siempre el 1,
 * las competidoras por orden de alta. El color sigue a la marca, nunca a su posición en una tabla.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export function brandColors(brands: { id: string; is_own: boolean; created_at: string }[]): Record<string, string> {
  const ordered = [...brands].sort((a, b) => Number(b.is_own) - Number(a.is_own) || a.created_at.localeCompare(b.created_at));
  return Object.fromEntries(ordered.map((b, i) => [b.id, SERIES[i] ?? '#8a93a6']));
}

export const EVENT_LABELS: Record<string, string> = {
  new_product: 'Producto nuevo',
  removed_product: 'Producto retirado',
  price_change: 'Cambio de precio',
  discount_start: 'Empieza descuento',
  discount_end: 'Acaba descuento',
  out_of_stock: 'Sin stock',
  back_in_stock: 'Vuelve el stock',
  promo_change: 'Cambio de promoción',
};
