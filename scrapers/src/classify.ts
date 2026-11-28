import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { candidateTypes, classifyByRules, TYPES, verticalOf } from '../../web/lib/taxonomy.js';
import { chunk, demandedSiteIds, fetchAll, getDb, matchesSiteFilter, must } from './db.js';

/**
 * Clasifica los productos sin tipo (products.product_type) en la taxonomía de web/lib/taxonomy.ts:
 *   1. reglas por sector (rápidas y gratis);
 *   2. lo que no encaja, con Claude (si hay ANTHROPIC_API_KEY), eligiendo solo entre los tipos del sector;
 *   3. sin IA, 'otros' (source = 'fallback'), que se reintenta con IA cuando haya clave.
 *
 * Uso:
 *   npm run classify                       -> productos sin clasificar de las webs que se capturan
 *   npm run classify -- --site sklum       -> solo esas webs
 *   npm run classify -- --reclassify       -> vuelve a clasificar todo (menos lo corregido a mano)
 *   npm run classify -- --dry-run          -> muestra el resultado sin guardar
 *
 * Variables: CLASSIFY_MODEL (por defecto claude-opus-5-5; claude-haiku-5-5 es mucho más barato),
 * CLASSIFY_BATCH (productos por llamada, 80), CLASSIFY_MAX (máximo por ejecución, 5000).
 */

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const MODEL = process.env.CLASSIFY_MODEL || 'claude-opus-5-5';
const BATCH = Number(process.env.CLASSIFY_BATCH ?? 80);
const MAX = Number(process.env.CLASSIFY_MAX ?? 5000);

interface Item {
  id: string;
  title: string;
  category: string | null;
  url: string | null;
  product_type_source: string | null;
}

const labelList = (keys: string[]) =>
  keys.map((k) => {
    const t = TYPES.find((x) => x.key === k)!;
    return `- ${k}: ${t.es} / ${t.en}`;
  }).join('\n');

/** Clasifica un lote con Claude. Devuelve id → tipo (solo claves válidas). */
async function classifyWithAI(client: Anthropic, items: Item[], keys: string[], verticals: string[]): Promise<Map<string, string>> {
  const schema = z.object({
    items: z.array(z.object({ i: z.number().int(), type: z.enum(keys as [string, ...string[]]) })),
  });
  const sector = verticals.map((v) => verticalOf(v)?.es ?? v).join(', ') || 'sin especificar';
  // El sistema (lista de tipos) es estable por sector: se cachea entre lotes
  const system =
    'Clasificas productos de tiendas online europeas en un tipo de producto. Los títulos pueden estar en cualquier idioma.\n' +
    'Elige para cada producto exactamente una clave de esta lista (la más específica que encaje). Usa "packs" solo para lotes de productos distintos, ' +
    '"otros" si ninguna encaja de verdad.\n\n' +
    `Sector de la tienda: ${sector}\n\nTipos permitidos:\n${labelList(keys)}`;
  const lines = items.map((it, i) => {
    let path = '';
    try {
      path = it.url ? decodeURIComponent(new URL(it.url).pathname) : '';
    } catch {
      path = '';
    }
    return JSON.stringify({ i, title: it.title, category: it.category ?? undefined, path: path || undefined });
  });

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'low', format: zodOutputFormat(schema) },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Clasifica estos ${items.length} productos (uno por línea, JSON):\n${lines.join('\n')}` }],
  });
  if (response.stop_reason === 'refusal') throw new Error('La IA ha rechazado el lote');
  const out = new Map<string, string>();
  for (const r of response.parsed_output?.items ?? []) {
    const it = items[r.i];
    if (it && keys.includes(r.type)) out.set(it.id, r.type);
  }
  return out;
}

async function main() {
  const dry = flag('dry-run');
  const reclassify = flag('reclassify');
  const filter = value('site') ?? process.env.SITE;
  const db = getDb();
  const useAI = Boolean(process.env.ANTHROPIC_API_KEY) && process.env.CLASSIFY_AI !== '0';
  const client = useAI ? new Anthropic() : null;
  console.log(`Clasificación de productos · IA: ${useAI ? MODEL : 'no (falta ANTHROPIC_API_KEY): solo reglas'}`);

  const demanded = await demandedSiteIds(db, 'catalog');
  const sites = (must(await db.from('sites').select('id, base_url').order('created_at'), 'sites') as { id: string; base_url: string }[]).filter(
    (s) => demanded.has(s.id) && matchesSiteFilter(s.base_url, filter),
  );
  const verticalRows = must(await db.from('v_site_verticals').select('site_id, verticals'), 'v_site_verticals') as { site_id: string; verticals: string[] | null }[];
  const verticalsOf = new Map(verticalRows.map((r) => [r.site_id, r.verticals ?? []]));

  let budget = MAX;
  const totals = { rules: 0, ai: 0, fallback: 0 };
  for (const site of sites) {
    if (budget <= 0) break;
    const items = (
      await fetchAll<Item>((from, to) => {
        let q = db.from('products').select('id, title, category, url, product_type_source').eq('site_id', site.id).is('removed_at', null);
        if (reclassify) q = q.or('product_type_source.is.null,product_type_source.neq.manual');
        else if (useAI) q = q.or('product_type.is.null,product_type_source.eq.fallback');
        else q = q.is('product_type', null);
        return q.order('id').range(from, to);
      })
    ).slice(0, budget);
    if (!items.length) continue;
    budget -= items.length;
    const verticals = verticalsOf.get(site.id) ?? [];
    const keys = candidateTypes(verticals);
    console.log(`→ ${site.base_url}: ${items.length} productos (${verticals.join(', ') || 'sin sector'})`);

    const result = new Map<string, { type: string; source: 'rules' | 'ai' | 'fallback' }>();
    const pending: Item[] = [];
    for (const it of items) {
      // Lo que ya tenía tipo por reglas y solo se reclasifica por IA no vuelve a pasar por reglas
      const byRule = it.product_type_source === 'fallback' && !reclassify ? null : classifyByRules(it, verticals);
      if (byRule && keys.includes(byRule)) result.set(it.id, { type: byRule, source: 'rules' });
      else pending.push(it);
    }

    if (client && pending.length) {
      for (const batch of chunk(pending, BATCH)) {
        try {
          const ai = await classifyWithAI(client, batch, keys, verticals);
          for (const it of batch) {
            const type = ai.get(it.id);
            if (type) result.set(it.id, { type, source: 'ai' });
          }
        } catch (e) {
          if (e instanceof Anthropic.RateLimitError) console.warn('  aviso: límite de la API; el resto queda para la próxima ejecución');
          else if (e instanceof Anthropic.APIError) console.warn(`  aviso: error de la API (${e.status}): ${e.message}`);
          else console.warn(`  aviso: ${(e as Error).message}`);
          if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.AuthenticationError) break;
        }
      }
    }
    for (const it of pending) if (!result.has(it.id) && it.product_type_source !== 'fallback') result.set(it.id, { type: 'otros', source: 'fallback' });

    // Resumen y guardado agrupado por tipo
    const groups = new Map<string, string[]>();
    for (const [id, r] of result) {
      totals[r.source]++;
      const k = `${r.type}|${r.source}`;
      groups.set(k, [...(groups.get(k) ?? []), id]);
    }
    const counts = [...groups].map(([k, ids]) => [k.split('|')[0], ids.length] as const).reduce((m, [t, n]) => m.set(t, (m.get(t) ?? 0) + n), new Map<string, number>());
    console.log(`  ${[...counts].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(' · ')}`);
    if (dry) {
      for (const it of items.slice(0, 15)) console.log(`    ${result.get(it.id)?.type ?? '—'} (${result.get(it.id)?.source ?? '—'}) ← ${it.title}`);
      continue;
    }
    const now = new Date().toISOString();
    for (const [k, ids] of groups) {
      const [type, source] = k.split('|');
      for (const part of chunk(ids, 200)) {
        must(await db.from('products').update({ product_type: type, product_type_source: source, product_type_at: now }).in('id', part), 'update product_type');
      }
    }
  }
  console.log(`\nTerminado: ${totals.rules} por reglas, ${totals.ai} con IA, ${totals.fallback} sin clasificar ('otros').`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
