import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Clave pública de Supabase (sb_publishable_… o la anon antigua). Solo se usa para la sesión del usuario. */
export function publicSupabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL y/o SUPABASE_PUBLISHABLE_KEY (ver web/.env.example).');
  return { url, key };
}

/**
 * Cliente de Supabase con la sesión del usuario (cookies). Sirve para Auth: registro, login, sesión.
 * Los datos del panel se siguen leyendo con lib/db.ts (clave de servicio) tras comprobar el acceso.
 */
export async function authClient() {
  const store = await cookies();
  const { url, key } = publicSupabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Desde un componente de servidor no se pueden escribir cookies; el proxy ya refresca la sesión.
        }
      },
    },
  });
}
