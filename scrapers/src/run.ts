import { mkdir, writeFile } from 'node:fs/promises';
import { adapters, detectPlatform } from './adapters/index.js';
import { getDb, must } from './db.js';
import { normalizeBase } from './http.js';
import { persistScrape } from './persist.js';
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

async function scrapeUrl(baseUrl: string, platform: Platform | 'auto') {
  const resolved = platform === 'auto' ? await detectPlatform(baseUrl) : platform;
  opts.log(`→ ${baseUrl} (${resolved}${platform === 'auto' ? ', detectada' : ''})`);
  return adapters[resolved].scrape(baseUrl, opts);
}

async function dryRun(url: string) {
  const base = normalizeBase(url);
  const result = await scrapeUrl(base, (value('platform') as Platform) ?? 'auto');
  const variants = result.products.reduce((n, p) => n + p.variants.length, 0);
  console.log(`\n${result.products.length} productos, ${variants} variantes (${result.platform})`);
  result.warnings.slice(0, 10).forEach((w) => console.warn(`  aviso: ${w}`));
  for (const p of result.products.slice(0, 5)) {
    const v = p.variants[0];
    console.log(`  - ${p.title} · ${p.variants.length} variantes · desde ${v?.price ?? '?'} ${v?.currency ?? ''}`);
  }
  await mkdir('out', { recursive: true });
  const file = `out/${new URL(base).host}.json`;
  await writeFile(file, JSON.stringify(result, null, 2));
  console.log(`\nResultado completo en ${file}`);
}

async function main() {
  if (flag('dry-run')) {
    const url = value('url');
    if (!url) throw new Error('En modo --dry-run indica la web con --url https://…');
    return dryRun(url);
  }

  const db = getDb();
  let query = db.from('sites').select('id, base_url, platform, currency').eq('active', true);
  const only = value('site');
  if (only) query = query.ilike('base_url', `%${only}%`);
  const sites = must(await query, 'select sites') as {
    id: string;
    base_url: string;
    platform: Platform | 'auto';
    currency: string;
  }[];
  if (!sites.length) return console.log('No hay webs activas que capturar.');

  let failures = 0;
  for (const site of sites) {
    const base = normalizeBase(site.base_url);
    const run = must(
      await db.from('scrape_runs').insert({ site_id: site.id }).select('id').single(),
      'insert scrape_run',
    ) as { id: string };
    try {
      const result = await scrapeUrl(base, site.platform);
      if (!result.products.length) throw new Error(result.warnings.at(-1) ?? 'La captura no ha devuelto productos.');
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
        })
        .eq('id', run.id);
      await db
        .from('sites')
        .update({ last_scraped_at: new Date().toISOString(), // Solo se fija la plataforma cuando se detecta una API (genérico se vuelve a comprobar cada día)
          ...(site.platform === 'auto' && result.platform !== 'generic' ? { platform: result.platform } : {}) })
        .eq('id', site.id);
    } catch (e) {
      failures++;
      const msg = (e as Error).message;
      console.error(`  ERROR en ${base}: ${msg}`);
      await db
        .from('scrape_runs')
        .update({ status: 'error', finished_at: new Date().toISOString(), error: msg.slice(0, 2000) })
        .eq('id', run.id);
    }
  }
  console.log(`\nTerminado: ${sites.length - failures}/${sites.length} webs OK.`);
  if (failures === sites.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
