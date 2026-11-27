import 'server-only';
import { headers } from 'next/headers';

/** URL pública de la app (para enlaces en emails y redirecciones de OAuth). SITE_URL manda; si no, la del host. */
export async function siteUrl(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Solo rutas internas como destino tras el login (evita redirecciones abiertas). */
export function safeNext(next: string | null | undefined, fallback = '/app'): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
