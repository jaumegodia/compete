const USER_AGENT =
  process.env.SCRAPER_USER_AGENT ??
  'Mozilla/5.0 (compatible; CompeteBot/0.1; +https://github.com/jaumegodia/compete)';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(public status: number, public url: string) {
    super(`HTTP ${status} en ${url}`);
  }
}

/** GET con timeout y reintentos (429 y 5xx). Devuelve el texto de la respuesta. */
export async function getText(
  url: string,
  { retries = 3, timeoutMs = 20000, accept = '*/*' } = {},
): Promise<{ text: string; status: number; contentType: string; finalUrl: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'es-ES,es;q=0.9' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1));
        lastErr = new HttpError(res.status, url);
        continue;
      }
      if (!res.ok) throw new HttpError(res.status, url);
      return {
        text: await res.text(),
        status: res.status,
        contentType: res.headers.get('content-type') ?? '',
        finalUrl: res.url || url,
      };
    } catch (err) {
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) throw err;
      lastErr = err;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr;
}

export async function getJson<T = unknown>(url: string, opts = {}): Promise<T> {
  const { text } = await getText(url, { accept: 'application/json', ...opts });
  return JSON.parse(text) as T;
}

/** Normaliza la URL base: con protocolo y sin barra final. */
export function normalizeBase(url: string): string {
  const u = new URL(url.startsWith('http') ? url : `https://${url}`);
  return `${u.protocol}//${u.host}`;
}

/** Convierte "1.299,00", "1299.00", 1299 o "129900" (unidades menores) a número. */
export function parsePrice(value: unknown, minorUnit?: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? round2(value) : null;
  let s = String(value).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (minorUnit !== undefined) {
    const n = Number(s.replace(/[.,]/g, ''));
    return Number.isFinite(n) ? round2(n / 10 ** minorUnit) : null;
  }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.'); // formato europeo
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? round2(n) : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
