import 'server-only';
import { db, must } from './db';

export interface BrandSummary {
  id: string;
  name: string;
  is_own: boolean;
  created_at: string;
  sites: number;
  active_sites: number;
  products: number;
  variants: number;
  discounted_variants: number;
  out_of_stock_variants: number;
  avg_rating: number | null;
  reviews: number | null;
  promo_date: string | null;
  main_discount_pct: number | null;
  up_to: boolean | null;
  campaigns: string[] | null;
  codes: string[] | null;
  free_shipping: boolean | null;
  last_run_at: string | null;
  last_run_status: string | null;
}

export interface Site {
  id: string;
  brand_id: string;
  base_url: string;
  platform: string;
  active: boolean;
  last_scraped_at: string | null;
}

export interface EventRow {
  id: number;
  type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  detected_at: string;
  product: { id: string; title: string; url: string } | null;
  variant: { title: string | null; size: string | null } | null;
  site: { id: string; base_url: string; brand_id: string } | null;
}

export async function getBrands(): Promise<BrandSummary[]> {
  const rows = must(await db().from('v_brand_summary').select('*'), 'brands') as BrandSummary[];
  return rows.sort((a, b) => Number(b.is_own) - Number(a.is_own) || a.created_at.localeCompare(b.created_at));
}

export async function getSites(): Promise<Site[]> {
  return must(
    await db().from('sites').select('id, brand_id, base_url, platform, active, last_scraped_at').order('created_at'),
    'sites',
  ) as Site[];
}

export async function getCompetitorLinks(): Promise<{ brand_id: string; competitor_id: string }[]> {
  return must(await db().from('brand_competitors').select('brand_id, competitor_id'), 'brand_competitors') as {
    brand_id: string;
    competitor_id: string;
  }[];
}

const EVENT_SELECT =
  'id, type, old_value, new_value, detected_at, product:products(id, title, url), variant:variants(title, size), site:sites(id, base_url, brand_id)';

/** Eventos entre dos instantes (ISO), más recientes primero. */
export async function getEvents(fromIso: string, toIso: string, limit = 2000): Promise<EventRow[]> {
  return must(
    await db()
      .from('events')
      .select(EVENT_SELECT)
      .gte('detected_at', fromIso)
      .lt('detected_at', toIso)
      .order('detected_at', { ascending: false })
      .limit(limit),
    'events',
  ) as unknown as EventRow[];
}

export interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  platform: string | null;
  products_found: number | null;
  variants_found: number | null;
  events_created: number | null;
  error: string | null;
  site: { base_url: string; brand_id: string } | null;
}

export async function getRuns(limit = 50): Promise<RunRow[]> {
  return must(
    await db()
      .from('scrape_runs')
      .select('id, started_at, finished_at, status, platform, products_found, variants_found, events_created, error, site:sites(base_url, brand_id)')
      .order('started_at', { ascending: false })
      .limit(limit),
    'runs',
  ) as unknown as RunRow[];
}

export interface PromoRow {
  site_id: string;
  captured_on: string;
  main_discount_pct: number | null;
  up_to: boolean;
  codes: string[];
  campaigns: string[];
  free_shipping: boolean;
  page_url: string;
  messages: { text: string; source: string; discountPct: number | null }[];
}

export async function getPromotions(fromDate: string): Promise<PromoRow[]> {
  return must(
    await db()
      .from('site_promotions')
      .select('site_id, captured_on, main_discount_pct, up_to, codes, campaigns, free_shipping, page_url, messages')
      .gte('captured_on', fromDate)
      .order('captured_on', { ascending: false }),
    'promotions',
  ) as PromoRow[];
}
