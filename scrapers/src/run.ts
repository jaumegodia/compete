import { mkdir, writeFile } from 'node:fs/promises';
import { adapters, detectPlatform } from './adapters/index.js';
import { demandedSiteIds, getDb, matchesSiteFilter, must, siteCountries } from './db.js';
import { marketOf } from './dataforseo.js';
import { normalizeBase } from './http.js';
import { persistPromos, persistScrape } from './persist.js';
import { scrapePromos, type PromoSnapshot } from './promos.js';
import type { Platform, ScrapeOptions } from './types.js';

/**
 * Uso:
 *   npm run scrape                          -> todas las webs activas de Supabase
 *   npm run scrape -- --site dormideo       -> solo las webs cuya URL contiene "dormideo"
 *   npm run scrape:dry -- --url https://www.dormideo.com
 *                                           -> prueba sin base de datos; guarda el resultado en out/
 */

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const opts: ScrapeOptions = {
  maxProducts: Number(process.env.MAX_PRODUCTS ?? 2000),
  delayMs: Number(process.env.DELAY_MS ?? 500),
  log: (m) => console.log(m),
};

async function scrapeUrl(
  baseUrl: string,
  platform: Platform | 'auto',
  includeUrlPatterns?: string[] | null,
  config?: Record<string, unknown> | null,
) {
  const resolved = platform === 'auto' ? await detectPlatform(baseUrl) : platform;
  opts.log(`→ ${baseUrl} (${resolved}${platform === 'auto' ? ', detectada' : ''})`);
  if (includeUrlPatterns?.length) opts.log(`  filtro de URLs: ${includeUrlPatterns.join(' | ')}`);
  return adapters[resolved].scrape(baseUrl, { ...opts, includeUrlPatterns, config });
}

function logPromos(p: PromoSnapshot) {
  const main = p.mainDiscountPct === null ? 'sin descuento detectado' : `${p.upTo ? 'hasta ' : ''}${p.mainDiscountPct}%`;
  console.log(`  promoción home: ${main}` +
    (p.campaigns.length ? ` · campaña: ${p.campaigns.join(', ')}` : '') +
    (p.codes.length ? ` · códigos: ${p.codes.join(', ')}` : '') +
    (p.freeShipping ? ' · envío gratis' : ''));
  p.messages.slice(0, 8).forEach((m) => console.log(`    [${m.source}] ${m.text}`));
}

async function dryRun(url: string) {
  const base = normalizeBase(url);
  if (flag('promos-only')) {
    const promos = await scrapePromos(base);
    console.log(`→ ${base}`);
    logPromos(promos);
    return;
  }
  const include = value('include');
  const config = value('config');
  const result = await scrapeUrl(
    base,
    (value('platform') as Platform) ?? 'auto',
    include ? include.split(',') : null,
    config ? JSON.parse(config) : null,
  );
  if (result.error) console.warn(`  ERROR: ${result.error}`);
  if (result.diagnostics) console.log(`  diagnóstico: ${JSON.stringify(result.diagnostics)}`);
  const variants = result.products.reduce((n, p) => n + p.variants.length, 0);
  console.log(`\n${result.products.length} productos, ${variants} variantes (${result.platform})`);
  result.warnings.slice(0, 10).forEach((w) => console.warn(`  aviso: ${w}`));
  for (const p of result.products.slice(0, 5)) {
    const v = p.variants[0];
    console.log(`  - ${p.title} · ${p.variants.length} variantes · desde ${v?.price ?? '?'} ${v?.currency ?? ''}`);
  }
  let promos: PromoSnapshot | null = null;
  try {
    promos = await scrapePromos(base);
    logPromos(promos);
  } catch (e) {
    console.warn(`  aviso: promociones de la home: ${(e as Error).message}`);
  }
  await mkdir('out', { recursive: true });
  const file = `out/${new URL(base).host}.json`;
  await writeFile(file, JSON.stringify({ ...result, promos }, null, 2));
  console.log(`\nResultado completo en ${file}`);
}

async function main() {
  if (flag('dry-run')) {
    const url = value('url');
    if (!url) throw new Error('En modo --dry-run indica la web con --url https://…');
    return dryRun(url);
  }

  const db = getDb();
  const query = db.from('sites').select('id, base_url, platform, currency, include_url_patterns, scrape_config').eq('active', true);
  // Solo las webs que algún proyecto vivo sigue sin pausar (ver v_site_demand)
  const [catalog, promos, countries] = await Promise.all([demandedSiteIds(db, 'catalog'), demandedSiteIds(db, 'promos'), siteCountries(db)]);
  const only = value('site') ?? process.env.SITE;
  const all = must(await query, 'select sites') as {
    id: string;
    base_url: string;
    platform: Platform | 'auto';
    currency: string;
    include_url_patterns: string[] | null;
    scrape_config: Record<string, unknown> | null;
  }[];
  const sites = all.filter((s) => catalog.has(s.id) && matchesSiteFilter(s.base_url, only));
  if (!sites.length) return console.log('No hay webs activas que capturar.');

  let failures = 0;
  for (const site of sites) {
    const base = normalizeBase(site.base_url);
    const run = must(
      await db.from('scrape_runs').insert({ site_id: site.id }).select('id').single(),
      'insert scrape_run',
    ) as { id: string };
    let diagnostics: Record<string, unknown> | null = null;
    try {
      // Google Shopping busca en el país del proyecto, salvo que la web fije el suyo en scrape_config
      const market = marketOf(countries.get(site.id));
      const config = { locationCode: market.location_code, languageCode: market.language_code, ...(site.scrape_config ?? {}) };
      const result = await scrapeUrl(base, site.platform, site.include_url_patterns, config);
      diagnostics = result.diagnostics ?? null;
      if (!result.products.length) {
        const detail = result.warnings.filter((w) => w !== result.error).slice(0, 3);
        throw new Error(
          (result.error ?? 'La captura no ha devuelto productos.') + (detail.length ? ` · Detalle: ${detail.join(' | ')}` : ''),
        );
      }
      const saved = await persistScrape(db, site, run.id, result, opts.log);
      const warnings = [...result.warnings, ...saved.warnings];
      warnings.slice(0, 5).forEach((w) => console.warn(`  aviso: ${w}`));
      await db
        .from('scrape_runs')
        .update({
          status: 'ok',
          finished_at: new Date().toISOString(),
          platform: result.platform,
          products_found: result.products.length,
          variants_found: saved.variants,
          events_created: saved.events,
          error: warnings.length ? `${warnings.length} avisos: ${warnings.slice(0, 3).join(' | ')}` : null,
          diagnostics,
        })
        .eq('id', run.id);
      await db
        .from('sites')
        .update({
          last_scraped_at: new Date().toISOString(),
          // Solo se fija la plataforma cuando se detecta una API (genérico se vuelve a comprobar cada día)
          ...(site.platform === 'auto' && result.platform !== 'generic' ? { platform: result.platform } : {}),
        })
        .eq('id', site.id);
    } catch (e) {
      failures++;
      const msg = (e as Error).message;
      console.error(`  ERROR en ${base}: ${msg}`);
      await db
        .from('scrape_runs')
        .update({ status: 'error', finished_at: new Date().toISOString(), error: msg.slice(0, 2000), diagnostics })
        .eq('id', run.id);
    }
    if (promos.has(site.id)) await capturePromos(db, site.id, run.id, base);
  }
  console.log(`\nTerminado: ${sites.length - failures}/${sites.length} webs OK.`);
  if (failures === sites.length) process.exitCode = 1;
}

/** Las promociones de la home se capturan aunque falle el catálogo, y sus errores no paran la ejecución. */
async function capturePromos(db: ReturnType<typeof getDb>, siteId: string, runId: string, base: string) {
  try {
    const promos = await scrapePromos(base);
    logPromos(promos);
    if (await persistPromos(db, siteId, runId, promos)) console.log('  ¡cambio de promoción en la home!');
  } catch (e) {
    console.warn(`  aviso: promociones de la home: ${(e as Error).message}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
