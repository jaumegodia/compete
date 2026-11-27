import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function getDb(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY (ver .env.example).');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Lee todas las filas de una consulta paginando de 1000 en 1000 (límite por defecto de la API). */
export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

export type Module = 'catalog' | 'promos' | 'reviews' | 'ads' | 'seo';

/**
 * Webs que algún proyecto vivo sigue sin pausar y cuyo plan incluye el módulo (vista v_site_demand).
 * Así una web que ningún cliente sigue, o que solo siguen clientes sin ese módulo, no gasta captura.
 */
export async function demandedSiteIds(db: SupabaseClient, module: Module): Promise<Set<string>> {
  const rows = must(await db.from('v_site_demand').select('site_id').eq(`want_${module}`, true), 'v_site_demand') as { site_id: string }[];
  return new Set(rows.map((r) => r.site_id));
}

/** Filtro --site: uno o varios trozos de URL separados por comas o espacios ("emma, flex.es"). */
export function matchesSiteFilter(baseUrl: string, filter: string | undefined | null): boolean {
  const parts = (filter ?? '').split(/[\s,]+/).filter(Boolean);
  return !parts.length || parts.some((p) => baseUrl.toLowerCase().includes(p.toLowerCase()));
}
