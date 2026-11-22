import { mkdir, writeFile } from 'node:fs/promises';
import { dfsRequest, SPAIN } from './dataforseo.js';

/**
 * Sonda: guarda en out/ la respuesta cruda de la SERP de Google (escritorio y móvil) y de Google Shopping
 * para unas búsquedas, para ver qué tipos de resultado (anuncios, Shopping patrocinado…) devuelve DataForSEO.
 *   npm run sov:probe -- "colchón 150x190" "colchón viscoelástico"
 */

const keywords = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!keywords.length) keywords.push('colchón 150x190', 'colchón viscoelástico', 'comprar colchón');

const summarize = (items: any[]) => {
  const counts: Record<string, number> = {};
  for (const i of items ?? []) counts[i.type] = (counts[i.type] ?? 0) + 1;
  return counts;
};

await mkdir('out', { recursive: true });
let cost = 0;
for (const keyword of keywords) {
  for (const device of ['desktop', 'mobile'] as const) {
    const json = await dfsRequest('/serp/google/organic/live/advanced', [{ ...SPAIN, keyword, device, depth: 20 }]);
    const t = json.tasks?.[0];
    cost += Number(t?.cost ?? 0);
    const r = t?.result?.[0];
    console.log(`google ${device} «${keyword}»: ${t?.status_code} · tipos ${JSON.stringify(summarize(r?.items))} · item_types ${JSON.stringify(r?.item_types)}`);
    for (const i of r?.items ?? []) {
      if (i.type === 'paid') console.log(`   paid #${i.rank_group} ${i.domain} · ${i.title}`);
      if (/shopping|product/.test(i.type)) {
        console.log(`   ${i.type}: ${JSON.stringify(i).slice(0, 600)}`);
      }
    }
    await writeFile(`out/serp-${device}-${keyword.replace(/\W+/g, '_')}.json`, JSON.stringify(json, null, 1));
  }
  const m = await dfsRequest('/merchant/google/products/task_post', [{ ...SPAIN, keyword, priority: 2 }]);
  const id = m.tasks?.[0]?.id;
  cost += Number(m.cost ?? 0);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const got = await dfsRequest(`/merchant/google/products/task_get/advanced/${id}`);
    const t = got.tasks?.[0];
    if (!t || [40601, 40602].includes(t.status_code)) continue;
    cost += Number(t.cost ?? 0);
    const r = t.result?.[0];
    console.log(`shopping «${keyword}»: ${t.status_code} · tipos ${JSON.stringify(summarize(r?.items))}`);
    for (const it of (r?.items ?? []).slice(0, 40)) console.log(`   ${it.type} #${it.rank_group} ${it.seller} · ${it.title} · ${it.price}`);
    await writeFile(`out/shopping-${keyword.replace(/\W+/g, '_')}.json`, JSON.stringify(got, null, 1));
    break;
  }
}
console.log(`Coste: ${cost.toFixed(4)} $`);
