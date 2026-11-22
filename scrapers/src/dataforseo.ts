import { sleep } from './http.js';

/** Cliente mínimo de la API v3 de DataForSEO. Credenciales: DATAFORSEO_LOGIN y DATAFORSEO_PASSWORD. */

export const DFS = 'https://api.dataforseo.com/v3';
export const SPAIN = { location_code: 2724, language_code: 'es' };
export const PENDING = new Set([40601, 40602]); // Task Handed / Task In Queue

function authHeaders(): Record<string, string> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  return login && password ? { authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}` } : {};
}

/** POST (con body) o GET a un endpoint, con reintentos ante errores 5xx/429/red. Devuelve el JSON completo. */
export async function dfsRequest(path: string, body?: unknown, timeoutMs = 120000): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${DFS}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    }).catch((e) => e as Error);
    if (res instanceof Error || res.status >= 500 || res.status === 429) {
      lastErr = res instanceof Error ? res : new Error(`DataForSEO: HTTP ${res.status}`);
      await sleep(3000 * (attempt + 1));
      continue;
    }
    if (res.status === 401 || res.status === 403)
      throw new Error(`DataForSEO: HTTP ${res.status}. Revisa DATAFORSEO_LOGIN y DATAFORSEO_PASSWORD (API Access).`);
    const json: any = await res.json();
    if (json.status_code !== 20000) throw new Error(`DataForSEO: ${json.status_code} ${json.status_message}`);
    return json;
  }
  throw lastErr;
}

export const isAuthError = (e: unknown) => /HTTP 40[13]/.test((e as Error)?.message ?? '');
