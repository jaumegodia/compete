import { dfsRequest, isAuthError, PENDING, marketOf } from './dataforseo.js';
import { getDb, must, demandedSiteIds, matchesSiteFilter, siteCountries } from './db.js';
import { sleep } from './http.js';
import { parseTimestamp } from './reviews.js';
import { domainOf } from './seo.js';

/**
 * Actividad publicitaria en Google (Ads Transparency Center vía DataForSEO SERP API, ads_search).
 *
 *   npm run ads                    -> todas las webs activas
 *   npm run ads -- --site emma     -> solo las webs cuya URL contiene "emma"
 *   npm run ads -- --dry-run       -> llama a la API pero no guarda nada
 *
 * Busca por dominio (sites.ads_domain o el de la web sin www), en España y todas las plataformas
 * (búsqueda, Shopping, YouTube, Display…). Solo cuenta como propios los del anunciante de la marca (ver ownAdvertisers). ADS_DEPTH: máximo de anuncios por web (700, el máximo que admite la API).
 */

const ACTIVE_DAYS = 7;

// ---------- Parseo (puro, probado en test/ads.test.ts) ----------

export interface AdRow {
  creative_id: string;
  advertiser_id: string | null;
  advertiser_name: string | null;
  format: string | null;
  url: string | null;
  preview_url: string | null;
  first_shown: string | null;
  last_shown: string | null;
}

export function parseAds(items: any[]): AdRow[] {
  const out = new Map<string, AdRow>();
  for (const i of items ?? []) {
    if (!i?.creative_id) continue;
    out.set(i.creative_id, {
      creative_id: i.creative_id,
      advertiser_id: i.advertiser_id ?? null,
      advertiser_name: i.title ?? null,
      format: i.format ?? null,
      url: i.url ?? null,
      preview_url: i.preview_url ?? null,
      first_shown: parseTimestamp(i.first_shown),
      last_shown: parseTimestamp(i.last_shown),
    });
  }
  return [...out.values()];
}

const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Anunciantes propios de la marca, por orden de preferencia:
 *  1. los indicados en sites.ads_advertiser_ids;
 *  2. los anunciantes cuyo nombre contiene la marca del dominio («flex» en flex.es, «emma» en emma-colchon.es);
 *  3. si ninguno coincide, el que más anuncios tiene para ese dominio.
 * El resto son terceros (agencias de terceros, distribuidores, afiliados o suplantaciones).
 */
export function ownAdvertisers(ads: AdRow[], configured: string[] | null, domain?: string): Set<string> {
  if (configured?.length) return new Set(configured);
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  for (const a of ads) {
    if (!a.advertiser_id) continue;
    counts.set(a.advertiser_id, (counts.get(a.advertiser_id) ?? 0) + 1);
    if (a.advertiser_name) names.set(a.advertiser_id, norm(a.advertiser_name));
  }
  if (domain) {
    const label = domain.replace(/^www\./, '').split('.')[0];
    const tokens = [norm(label), ...label.split('-').map(norm)].filter((t) => t.length >= 4);
    const matching = [...names].filter(([, name]) => tokens.some((t) => name.includes(t))).map(([id]) => id);
    if (matching.length) return new Set(matching);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  return new Set(top ? [top[0]] : []);
}

export interface AdSummary {
  ads_total: number;
  ads_active: number;
  ads_new_7d: number;
  by_format: Record<string, number>;
  advertisers: { id: string; name: string | null }[];
  third_party_active: number;
  third_party: { id: string; name: string | null; active: number }[];
}

/** Resumen de los anuncios propios; los de terceros solo se cuentan. */
export function summarizeAds(all: AdRow[], own: Set<string>, now = Date.now()): AdSummary {
  const ads = all.filter((a) => a.advertiser_id && own.has(a.advertiser_id));
  const since = now - ACTIVE_DAYS * 864e5;
  const active = ads.filter((a) => a.last_shown && new Date(a.last_shown).getTime() >= since);
  const by_format: Record<string, number> = {};
  for (const a of active) by_format[a.format ?? 'otro'] = (by_format[a.format ?? 'otro'] ?? 0) + 1;
  const advertisers = new Map<string, string | null>();
  for (const a of ads) if (a.advertiser_id && !advertisers.has(a.advertiser_id)) advertisers.set(a.advertiser_id, a.advertiser_name);
  return {
    ads_total: ads.length,
    ads_active: active.length,
    ads_new_7d: ads.filter((a) => a.first_shown && new Date(a.first_shown).getTime() >= since).length,
    by_format,
    advertisers: [...advertisers].map(([id, name]) => ({ id, name })),
    ...thirdParty(all.filter((a) => !a.advertiser_id || !own.has(a.advertiser_id)), since),
  };
}

function thirdParty(ads: AdRow[], since: number) {
  const by = new Map<string, { id: string; name: string | null; active: number }>();
  let activeTotal = 0;
  for (const a of ads) {
    const id = a.advertiser_id ?? '?';
    const e = by.get(id) ?? { id, name: a.advertiser_name, active: 0 };
    by.set(id, e);
    if (a.last_shown && new Date(a.last_shown).getTime() >= since) {
      e.active++;
      activeTotal++;
    }
  }
  return { third_party_active: activeTotal, third_party: [...by.values()].filter((e) => e.active > 0).sort((a, b) => b.active - a.active) };
}

// ---------- DataForSEO (modo task) ----------

const EP = '/serp/google/ads_search';

async function fetchAds(targets: { domain: string; location_code: number }[], depth: number) {
  let cost = 0;
  const results = new Map<string, { items: any[] } | { error: string }>();
  const posted = await dfsRequest(
    `${EP}/task_post`,
    targets.map(({ domain, location_code }) => ({ target: domain, location_code, platform: 'all', depth, tag: domain })),
  );
  cost += Number(posted.cost ?? 0);
  const pending = new Map<string, string>();
  for (const t of posted.tasks ?? []) {
    const domain = t.data?.target ?? t.data?.tag;
    if (t.status_code === 20100) pending.set(t.id, domain);
    else results.set(domain, { error: `${t.status_code} ${t.status_message}` });
  }
  const deadline = Date.now() + 20 * 60 * 1000;
  while (pending.size && Date.now() < deadline) {
    await sleep(15000);
    for (const [id, domain] of [...pending]) {
      const got = await dfsRequest(`${EP}/task_get/advanced/${id}`);
      const t = got.tasks?.[0];
      if (!t || PENDING.has(t.status_code)) continue;
      pending.delete(id);
      cost += Number(t.cost ?? 0);
      results.set(domain, t.status_code === 20000 ? { items: t.result?.[0]?.items ?? [] } : { error: `${t.status_code} ${t.status_message}` });
    }
  }
  for (const domain of pending.values()) results.set(domain, { error: 'sin resultado tras 20 minutos de espera' });
  return { results, cost };
}

// ---------- Ejecución ----------

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const siteIdx = args.indexOf('--site');
  const filter = siteIdx >= 0 ? args[siteIdx + 1] : process.env.SITE || '';
  const depth = Number(Math.min(Number(process.env.ADS_DEPTH ?? 700), 700));
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const db = getDb();
  const [demanded, countries] = await Promise.all([demandedSiteIds(db, 'ads'), siteCountries(db)]);
  const sites = (
    must(await db.from('sites').select('id, base_url, ads_domain, ads_advertiser_ids').eq('active', true).order('created_at'), 'sites') as {
      id: string;
      base_url: string;
      ads_domain: string | null;
      ads_advertiser_ids: string[] | null;
    }[]
  ).filter((s) => demanded.has(s.id) && matchesSiteFilter(s.base_url, filter));
  if (!sites.length) throw new Error(`Ninguna web activa${filter ? ` contiene «${filter}»` : ''}.`);

  const domainOfSite = new Map(sites.map((s) => [s.id, (s.ads_domain || domainOf(s.base_url)).toLowerCase()]));
  console.log(`Google Ads Transparency: ${sites.length} webs, hasta ${depth} anuncios por web`);
  let fetched;
  try {
    // Un dominio por web, en el país de los proyectos que la siguen
    const targets = new Map<string, number>();
    for (const s of sites) targets.set(domainOfSite.get(s.id)!, marketOf(countries.get(s.id)).location_code);
    fetched = await fetchAds([...targets].map(([domain, location_code]) => ({ domain, location_code })), depth);
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
      console.log('  sin anuncios en el centro de transparencia');
      if (!dry)
        must(
          await db.from('ad_snapshots').upsert(
            { site_id: site.id, platform: 'google', captured_on: today, ads_total: 0, ads_active: 0, ads_new_7d: 0, by_format: {}, advertisers: [], third_party_active: 0, third_party: [] },
            { onConflict: 'site_id,platform,captured_on' },
          ),
          'ad_snapshots',
        );
      continue;
    }
    if (!got || 'error' in got) {
      failures++;
      console.error(`  error: ${got && 'error' in got ? got.error : 'sin respuesta'}`);
      continue;
    }
    const ads = parseAds(got.items);
    const own = ownAdvertisers(ads, site.ads_advertiser_ids, domain);
    const s = summarizeAds(ads, own);
    console.log(
      `  ${s.ads_total} anuncios · ${s.ads_active} activos (7 días) · ${s.ads_new_7d} nuevos · formatos ${JSON.stringify(s.by_format)} · ` +
        `anunciante: ${s.advertisers.map((a) => `${a.name ?? '?'} (${a.id})`).join(', ') || '—'}`,
    );
    if (s.third_party.length)
      console.log(`  terceros activos: ${s.third_party.map((t) => `${t.name ?? t.id} ${t.active}`).join(' · ')}`);
    if (dry) continue;
    try {
      must(
        await db.from('ad_snapshots').upsert({ site_id: site.id, platform: 'google', captured_on: today, ...s }, { onConflict: 'site_id,platform,captured_on' }),
        'ad_snapshots',
      );
      for (let i = 0; i < ads.length; i += 500) {
        must(
          await db.from('ads').upsert(
            ads.slice(i, i + 500).map((a) => ({ ...a, own: !!a.advertiser_id && own.has(a.advertiser_id), site_id: site.id, platform: 'google', last_seen_at: now })),
            { onConflict: 'site_id,platform,creative_id' },
          ),
          'ads',
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
