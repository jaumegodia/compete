import { dfsRequest, PENDING } from './dataforseo.js';

/** Sonda de Google Ads Transparency (DataForSEO): anunciantes por nombre y sus anuncios en España. */

const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!names.length) names.push('Emma', 'Maxcolchon', 'Dormideo', 'Como una marmota', 'Flex');

async function task(ep: string, body: Record<string, unknown>) {
  const posted = await dfsRequest(`/serp/google/${ep}/task_post`, [body]);
  const t0 = posted.tasks?.[0];
  if (t0?.status_code !== 20100) throw new Error(`${ep}: ${t0?.status_code} ${t0?.status_message}`);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const got = await dfsRequest(`/serp/google/${ep}/task_get/advanced/${t0.id}`);
    const t = got.tasks?.[0];
    if (!t || PENDING.has(t.status_code)) continue;
    if (t.status_code !== 20000) throw new Error(`${ep}: ${t.status_code} ${t.status_message}`);
    return { result: t.result?.[0], cost: Number(posted.cost ?? 0) + Number(t.cost ?? 0) };
  }
  throw new Error(`${ep}: sin resultado`);
}

let cost = 0;
for (const name of names) {
  try {
    const adv = await task('ads_advertisers', { keyword: name, location_code: 2724 });
    cost += adv.cost;
    const items = adv.result?.items ?? [];
    console.log(`anunciantes «${name}»: ${items.length}`);
    for (const a of items.slice(0, 6)) console.log(`   ${JSON.stringify({ ...a, xpath: undefined })}`.slice(0, 500));
    const first = items.find((a: any) => a.advertiser_id);
    if (!first) continue;
    const ads = await task('ads_search', { advertiser_ids: [first.advertiser_id], location_code: 2724, platform: 'all', depth: 100 });
    cost += ads.cost;
    const list = ads.result?.items ?? [];
    const formats: Record<string, number> = {};
    for (const a of list) formats[a.format ?? '?'] = (formats[a.format ?? '?'] ?? 0) + 1;
    console.log(`   anuncios de ${first.title ?? first.advertiser_id}: ${list.length} (total ${ads.result?.items_count ?? '?'}) · formatos ${JSON.stringify(formats)}`);
    for (const a of list.slice(0, 3)) console.log(`   ${JSON.stringify({ ...a, xpath: undefined, preview_image: undefined })}`.slice(0, 600));
  } catch (e) {
    console.log(`«${name}»: error ${(e as Error).message}`);
  }
}
console.log(`Coste: ${cost.toFixed(4)} $`);
