import { createHash } from 'node:crypto';
import { dfsRequest, isAuthError, PENDING } from './dataforseo.js';
import { getDb, must, demandedSiteIds, matchesSiteFilter } from './db.js';
import { sleep } from './http.js';
import { domainOf } from './seo.js';

/**
 * Reseñas de Trustpilot con DataForSEO Business Data API.
 *
 *   npm run reviews                  -> todas las webs activas: nota global + últimas reseñas
 *   npm run reviews -- --site emma   -> solo las webs cuya URL contiene "emma"
 *   npm run reviews -- --dry-run     -> llama a la API pero no guarda nada
 *
 * El dominio de Trustpilot es el de la web (sin www) salvo que sites.trustpilot_domain diga otro.
 * REVIEWS_DEPTH: reseñas más recientes que se piden por web (100 por defecto; se cobra por cada 20).
 */

// ---------- Parseo (puro, probado en test/reviews.test.ts) ----------

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** "2026-11-20 08:14:03 +00:00" → ISO. Devuelve null si no se puede leer. */
export function parseTimestamp(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const iso = v.trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\s*([+-]\d{2}:?\d{2})?$/, (_, d, t, z) => `${d}T${t}${z ?? 'Z'}`);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Nota normalizada a escala de 5. */
const toFive = (r: any): number | null => {
  const v = n(r?.value);
  if (v === null) return null;
  const max = n(r?.rating_max) || 5;
  return Math.round((v / max) * 5 * 100) / 100;
};

export interface ReviewRow {
  review_id: string;
  rating: number | null;
  title: string | null;
  body: string | null;
  author: string | null;
  language: string | null;
  published_at: string | null;
  replied: boolean;
  url: string | null;
}

export interface TrustpilotResult {
  rating: number | null;
  reviews_count: number | null;
  profile_url: string | null;
  reviews: ReviewRow[];
}

const clean = (s: unknown) => (typeof s === 'string' && s.trim() ? s.trim() : null);

/** result[0] de trustpilot/reviews → nota global y reseñas sin duplicados. */
export function parseTrustpilot(result: any, domain: string): TrustpilotResult {
  const reviews = new Map<string, ReviewRow>();
  for (const i of result?.items ?? []) {
    const body = clean(i?.review_text);
    const title = clean(i?.title ?? i?.review_title);
    const author = clean(i?.user_profile?.name);
    const published_at = parseTimestamp(i?.timestamp);
    if (!body && !title) continue;
    const url = clean(i?.url ?? i?.review_url);
    const idFromUrl = url?.match(/\/reviews\/([a-f0-9]{16,})/i)?.[1];
    const review_id =
      clean(i?.review_id) ??
      idFromUrl ??
      createHash('sha1').update(`${published_at ?? ''}|${author ?? ''}|${title ?? ''}|${body ?? ''}`).digest('hex').slice(0, 24);
    reviews.set(review_id, {
      review_id,
      rating: toFive(i?.rating),
      title,
      body,
      author,
      language: clean(i?.language),
      published_at,
      replied: Array.isArray(i?.responses) && i.responses.length > 0,
      url,
    });
  }
  return {
    rating: toFive(result?.rating),
    reviews_count: n(result?.reviews_count) ?? n(result?.rating?.votes_count),
    profile_url: `https://es.trustpilot.com/review/${domain}`,
    reviews: [...reviews.values()],
  };
}

// ---------- DataForSEO (modo task) ----------

const EP = '/business_data/trustpilot/reviews';

/** Lanza una tarea por dominio y espera los resultados. */
async function fetchTrustpilot(
  domains: string[],
  depth: number,
): Promise<{ results: Map<string, { result: any } | { error: string }>; cost: number }> {
  let cost = 0;
  const results = new Map<string, { result: any } | { error: string }>();
  const posted = await dfsRequest(`${EP}/task_post`, domains.map((domain) => ({ domain, depth, sort_by: 'recency', tag: domain })));
  cost += Number(posted.cost ?? 0);
  const pending = new Map<string, string>();
  for (const t of posted.tasks ?? []) {
    const domain = t.data?.domain ?? t.data?.tag;
    if (t.status_code === 20100) pending.set(t.id, domain);
    else results.set(domain, { error: `${t.status_code} ${t.status_message}` });
  }
  const deadline = Date.now() + 15 * 60 * 1000;
  while (pending.size && Date.now() < deadline) {
    await sleep(15000);
    for (const [id, domain] of [...pending]) {
      const got = await dfsRequest(`${EP}/task_get/${id}`);
      const t = got.tasks?.[0];
      if (!t || PENDING.has(t.status_code)) continue;
      pending.delete(id);
      cost += Number(t.cost ?? 0);
      results.set(domain, t.status_code === 20000 ? { result: t.result?.[0] ?? null } : { error: `${t.status_code} ${t.status_message}` });
    }
  }
  for (const domain of pending.values()) results.set(domain, { error: 'sin resultado tras 15 minutos de espera' });
  return { results, cost };
}

// ---------- Ejecución ----------

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const siteIdx = args.indexOf('--site');
  const filter = siteIdx >= 0 ? args[siteIdx + 1] : process.env.SITE || '';
  const depth = Number(process.env.REVIEWS_DEPTH ?? 100);
  const today = new Date().toISOString().slice(0, 10);

  const db = getDb();
  const demanded = await demandedSiteIds(db, 'reviews');
  const sites = (
    must(await db.from('sites').select('id, base_url, trustpilot_domain').eq('active', true).order('created_at'), 'sites') as {
      id: string;
      base_url: string;
      trustpilot_domain: string | null;
    }[]
  ).filter((s) => demanded.has(s.id) && matchesSiteFilter(s.base_url, filter));
  if (!sites.length) throw new Error(`Ninguna web activa${filter ? ` contiene «${filter}»` : ''}.`);

  const domainOfSite = new Map(sites.map((s) => [s.id, (s.trustpilot_domain || domainOf(s.base_url)).toLowerCase()]));
  console.log(`Trustpilot: ${sites.length} webs, ${depth} reseñas más recientes por web`);
  let fetched;
  try {
    fetched = await fetchTrustpilot([...new Set(domainOfSite.values())], depth);
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    process.exit(1);
  }

  let failures = 0;
  for (const site of sites) {
    const domain = domainOfSite.get(site.id)!;
    const got = fetched.results.get(domain);
    console.log(`→ ${domain}`);
    if (got && 'error' in got && got.error.startsWith('40102')) {
      console.log(`  sin perfil en Trustpilot (si usa otro dominio, ponlo en sites.trustpilot_domain)`);
      continue;
    }
    if (!got || 'error' in got) {
      failures++;
      console.error(`  error: ${got && 'error' in got ? got.error : 'sin respuesta'}`);
      continue;
    }
    const tp = parseTrustpilot(got.result, domain);
    const recent = tp.reviews.filter((r) => r.published_at && Date.now() - new Date(r.published_at).getTime() < 30 * 864e5);
    console.log(
      `  nota ${tp.rating ?? '—'} · ${tp.reviews_count?.toLocaleString('es-ES') ?? '—'} reseñas · ${tp.reviews.length} leídas, ` +
        `${recent.length} de los últimos 30 días`,
    );
    if (dry) continue;
    try {
      if (tp.rating !== null || tp.reviews_count !== null) {
        must(
          await db.from('review_snapshots').upsert(
            { site_id: site.id, source: 'trustpilot', captured_on: today, rating: tp.rating, reviews_count: tp.reviews_count, profile_url: tp.profile_url },
            { onConflict: 'site_id,source,captured_on' },
          ),
          'review_snapshots',
        );
      }
      if (tp.reviews.length) {
        // Upsert sin tocar first_seen_at: se actualizan texto, nota y si ya tiene respuesta
        must(
          await db.from('reviews').upsert(
            tp.reviews.map((r) => ({ ...r, site_id: site.id, source: 'trustpilot' })),
            { onConflict: 'site_id,source,review_id' },
          ),
          'reviews',
        );
      }
    } catch (e) {
      failures++;
      console.error(`  error al guardar: ${(e as Error).message}`);
      if (isAuthError(e)) break;
    }
  }
  console.log(`Coste DataForSEO: ${fetched.cost.toFixed(4)} $${dry ? ' (sin guardar: --dry-run)' : ''}`);
  if (failures) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
