import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Cliente de Supabase con la clave secreta. Solo se importa desde el servidor. */
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY (ver web/.env.example).');
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

/**
 * Lee todas las filas de una consulta en páginas de 1000: la API de Supabase corta cada respuesta
 * en 1000 filas aunque se pida un `limit` mayor. La consulta debe tener un orden estable.
 */
export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
  max = 50000,
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; from < max; from += page) {
    const rows = must(await query(from, Math.min(from + page, max) - 1), what);
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}
