import { sleep } from '../http.js';
import type { Adapter, ScrapedProduct, ScrapedVariant, ScrapeOptions, ScrapeResult } from '../types.js';

/**
 * Adaptador Google Shopping (vía DataForSEO Merchant API) para webs que bloquean la captura directa
 * (p. ej. Cloudflare). Lee los resultados de Google Shopping España del vendedor configurado:
 *   1. Búsquedas de partida (sites.scrape_config.queries) para descubrir los modelos.
 *   2. Una búsqueda por modelo ("<marca> <modelo>"), que devuelve todas sus medidas.
 *   3. Agrupa por modelo: cada medida es una variante con su precio y precio tachado.
 *
 * Credenciales: DATAFORSEO_LOGIN y DATAFORSEO_PASSWORD (API Access del panel de DataForSEO).
 * Sin ellas no se envía cabecera (en el entorno de desarrollo la inyecta el proxy).
 */

const API = 'https://api.dataforseo.com/v3/merchant/google/products';

export interface ShoppingConfig {
  seller: string; // nombre del vendedor en Google Shopping, p. ej. "Maxcolchon ES"
  brand?: string; // prefijo de marca que se quita de los títulos, p. ej. "Maxcolchon"
  queries?: string[]; // búsquedas de partida
  discoverModels?: boolean; // una búsqueda más por cada modelo encontrado (por defecto, sí)
  maxQueries?: number; // límite de búsquedas por captura (coste), por defecto 60
  locationCode?: number; // 2724 = España
  languageCode?: string;
  pollMs?: number; // espera entre consultas de resultados
  timeoutMs?: number; // espera máxima por tanda de búsquedas
}

export interface ShoppingItem {
  type?: string;
  title?: string | null;
  price?: number | null;
  old_price?: number | null;
  currency?: string | null;
  seller?: string | null;
  product_id?: string | null;
  gid?: string | null;
  data_docid?: string | null;
  shopping_url?: string | null;
  product_images?: string[] | null;
  tags?: string[] | null;
  product_rating?: { value?: number | null; votes_count?: number | null; rating_max?: number | null } | null;
}

// ---------- Títulos ----------

const SIZE = /(\d{2,3})\s*[x×]\s*(\d{2,3})(?:\s*cm)?/i;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const DANGLING = /^(de|del|by|por|para|con|y|-|–|\+|,)$/i;

/** ¿Es esta palabra la marca (o un trozo cortado de ella, como "Maxcolch")? */
function isBrandWord(word: string, brand: string): boolean {
  const w = fold(word).replace(/[^a-z0-9]/g, '');
  const b = fold(brand).replace(/[^a-z0-9]/g, '');
  if (!w || !b) return false;
  const prefix = b.slice(0, Math.min(6, b.length));
  return w.startsWith(prefix) && (b.startsWith(w) || w.startsWith(b));
}

/** "Colchón Intense 90x190" → { model: "Colchón Intense", size: "90x190", extra: null } */
export function parseShoppingTitle(title: string, brand?: string): { model: string; size: string | null; extra: string | null } {
  let t = title.replace(/\s+/g, ' ').trim();
  const m = t.match(SIZE);
  const size = m ? `${m[1]}x${m[2]}` : null;
  if (m) t = t.replace(m[0], ' ');
  // Detalle entre paréntesis (p. ej. "(Cajón Pistón)"): opción de la variante, no del modelo
  const extras = [...t.matchAll(/\(([^)]*)\)?/g)].map((x) => x[1].trim()).filter(Boolean);
  t = t.replace(/\([^)]*\)?/g, ' ');
  if (brand) {
    // Quita la marca esté donde esté ("Maxcolchon Colchón Everest", "Colchón Gel Sport Maxcolchon",
    // "Topper 4cm Maxcolchon de Grosor Maxcolch") y las palabras que quedan colgando al final ("de", "by"…)
    const words = t.split(' ').filter((w) => w && !isBrandWord(w, brand));
    while (words.length > 1 && DANGLING.test(words[words.length - 1])) words.pop();
    if (words.length) t = words.join(' ');
  }
  const model = t.replace(/\s+/g, ' ').replace(/[\s\-–,+]+$/, '').trim();
  return { model: model || title.trim(), size, extra: extras.join(' · ') || null };
}

const modelKey = (model: string) => fold(model).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** ¿Es este resultado del vendedor configurado? */
export const isSeller = (item: ShoppingItem, seller: string) =>
  !!item.seller && fold(item.seller).replace(/\s+/g, ' ').trim() === fold(seller).replace(/\s+/g, ' ').trim();

// ---------- Agrupación ----------

/** Agrupa los resultados del vendedor por modelo; cada medida es una variante. */
export function groupShoppingItems(items: ShoppingItem[], cfg: ShoppingConfig): ScrapedProduct[] {
  const brand = cfg.brand ?? cfg.seller.replace(/\s+[A-Z]{2}$/, '');
  type Acc = { model: string; variants: Map<string, ScrapedVariant>; headline: ScrapedVariant | null; items: ShoppingItem[] };
  const byModel = new Map<string, Acc>();
  for (const it of items) {
    if (it.type && it.type !== 'google_shopping_serp') continue;
    if (!it.title || !isSeller(it, cfg.seller) || it.price == null) continue;
    const { model, size, extra } = parseShoppingTitle(it.title, brand);
    const key = modelKey(model);
    if (!key) continue;
    const acc: Acc = byModel.get(key) ?? { model, variants: new Map(), headline: null, items: [] };
    byModel.set(key, acc);
    acc.items.push(it);
    const variant: ScrapedVariant = {
      externalId: size ? [size, extra].filter(Boolean).join('|') : 'google',
      title: size ? [size, extra && `(${extra})`].filter(Boolean).join(' ') : null,
      sku: null,
      options: size ? { medida: size, ...(extra ? { detalle: extra } : {}) } : { fuente: 'precio destacado en Google Shopping' },
      price: it.price,
      compareAtPrice: it.old_price != null && it.old_price > it.price ? it.old_price : null,
      available: null, // Shopping no dice el stock; null evita falsos eventos de rotura
      currency: it.currency ?? 'EUR',
    };
    if (!size) {
      if (!acc.headline) acc.headline = variant;
    } else if (!acc.variants.has(variant.externalId)) acc.variants.set(variant.externalId, variant); // la primera aparición manda
  }

  return [...byModel.entries()].map(([key, acc]) => {
    // El precio destacado sin medida solo se guarda si el modelo no trae ninguna medida
    const variants = acc.variants.size ? [...acc.variants.values()] : acc.headline ? [acc.headline] : [];
    const rated = acc.items
      .filter((i) => i.product_rating?.value != null)
      .sort((a, b) => (b.product_rating?.votes_count ?? 0) - (a.product_rating?.votes_count ?? 0))[0]?.product_rating;
    const withId = acc.items.find((i) => i.product_id);
    const image = (withId ?? acc.items[0]).product_images?.[0] ?? null;
    return {
      externalId: `gshop:${key}`,
      url: `https://www.google.es/search?tbm=shop&q=${encodeURIComponent(`${brand} ${acc.model}`)}`,
      title: acc.model,
      category: null, // el panel deduce el tipo de producto del título
      vendor: brand,
      imageUrl: image,
      description: null,
      rating: rated?.value != null ? Math.round((rated.value / (rated.rating_max || 5)) * 5 * 100) / 100 : null,
      reviewCount: rated?.votes_count ?? null,
      raw: {
        source: 'google_shopping',
        seller: cfg.seller,
        googleProductId: withId?.product_id ?? null,
        gid: withId?.gid ?? null,
        tags: [...new Set(acc.items.flatMap((i) => i.tags ?? []))],
      },
      variants,
    };
  });
}

// ---------- DataForSEO ----------

function authHeaders(): Record<string, string> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  return login && password ? { authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}` } : {};
}

async function dfs(path: string, body?: unknown): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${API}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60000),
      });
      if (res.status === 401 || res.status === 403)
        throw new Error(`DataForSEO: HTTP ${res.status}. Revisa DATAFORSEO_LOGIN y DATAFORSEO_PASSWORD (API Access).`);
      if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`DataForSEO: HTTP ${res.status}`);
        await sleep(3000 * (attempt + 1));
        continue;
      }
      const json = await res.json();
      if (json.status_code !== 20000) throw new Error(`DataForSEO: ${json.status_code} ${json.status_message}`);
      return json;
    } catch (e) {
      if ((e as Error).message.startsWith('DataForSEO: HTTP 40') || (e as Error).message.match(/^DataForSEO: 4\d{4}/)) throw e;
      lastErr = e;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw lastErr;
}

const PENDING = new Set([40601, 40602]); // Task Handed / Task In Queue

/** Lanza una tanda de búsquedas y espera sus resultados. Devuelve los items y el coste. */
async function runQueries(
  queries: string[],
  cfg: ShoppingConfig,
  warnings: string[],
): Promise<{ items: ShoppingItem[]; cost: number; failed: number; failedQueries: string[] }> {
  if (!queries.length) return { items: [], cost: 0, failed: 0, failedQueries: [] };
  const failedQueries: string[] = [];
  let cost = 0;
  const posted = await dfs('/task_post', queries.map((keyword) => ({
    keyword,
    location_code: cfg.locationCode ?? 2724,
    language_code: cfg.languageCode ?? 'es',
    priority: 2,
  })));
  cost += Number(posted.cost ?? 0);
  const pending = new Map<string, string>();
  let failed = 0;
  for (const t of posted.tasks ?? []) {
    if (t.status_code === 20100) pending.set(t.id, t.data?.keyword);
    else {
      failed++;
      failedQueries.push(t.data?.keyword);
      warnings.push(`Google Shopping: no se pudo lanzar «${t.data?.keyword}»: ${t.status_message}`);
    }
  }
  const items: ShoppingItem[] = [];
  const deadline = Date.now() + (cfg.timeoutMs ?? 10 * 60 * 1000);
  while (pending.size && Date.now() < deadline) {
    await sleep(cfg.pollMs ?? 15000);
    for (const [id, keyword] of [...pending]) {
      const got = await dfs(`/task_get/advanced/${id}`);
      const t = got.tasks?.[0];
      if (!t || PENDING.has(t.status_code)) continue;
      pending.delete(id);
      cost += Number(t.cost ?? 0);
      if (t.status_code !== 20000) {
        failed++;
        failedQueries.push(keyword);
        warnings.push(`Google Shopping: «${keyword}» ha fallado: ${t.status_message}`);
        continue;
      }
      for (const r of t.result ?? []) items.push(...((r.items ?? []) as ShoppingItem[]));
    }
  }
  if (pending.size) {
    failed += pending.size;
    failedQueries.push(...pending.values());
    warnings.push(`Google Shopping: ${pending.size} búsquedas sin resultado tras la espera máxima.`);
  }
  return { items, cost, failed, failedQueries };
}

/** Como runQueries, pero reintenta una vez las búsquedas que fallan (DataForSEO da a veces "Internal SE Server Error"). */
async function runQueriesWithRetry(queries: string[], cfg: ShoppingConfig, warnings: string[]) {
  const firstWarnings: string[] = [];
  const first = await runQueries(queries, cfg, firstWarnings);
  if (!first.failedQueries.length) {
    warnings.push(...firstWarnings);
    return first;
  }
  const retry = await runQueries(first.failedQueries, cfg, warnings);
  return { items: first.items.concat(retry.items), cost: first.cost + retry.cost, failed: retry.failed, retried: first.failedQueries.length };
}

const dedupeQueries = (qs: string[]) => [...new Map(qs.map((q) => [fold(q).replace(/\s+/g, ' ').trim(), q.trim()])).values()];

export const googleShoppingAdapter: Adapter = {
  platform: 'google_shopping',
  async scrape(_baseUrl: string, opts: ScrapeOptions): Promise<ScrapeResult> {
    const cfg = opts.config as ShoppingConfig | undefined;
    if (!cfg?.seller) throw new Error('Google Shopping: falta sites.scrape_config.seller (nombre del vendedor en Google Shopping).');
    const brand = cfg.brand ?? cfg.seller.replace(/\s+[A-Z]{2}$/, '');
    const maxQueries = cfg.maxQueries ?? 60;
    const warnings: string[] = [];

    const seedQueries = dedupeQueries(cfg.queries?.length ? cfg.queries : [brand, `${brand} colchon`]).slice(0, maxQueries);
    opts.log(`  google shopping: ${seedQueries.length} búsquedas de partida (vendedor «${cfg.seller}»)`);
    const seed = await runQueriesWithRetry(seedQueries, cfg, warnings);
    let items = seed.items;
    let cost = seed.cost;
    let failed = seed.failed;

    let modelQueries: string[] = [];
    let modelsDiscovered = 0;
    let modelQueriesSkipped = 0;
    if (cfg.discoverModels !== false) {
      const done = new Set(seedQueries.map((q) => fold(q)));
      const candidates = dedupeQueries(groupShoppingItems(items, cfg).map((p) => `${brand} ${p.title}`)).filter(
        (q) => !done.has(fold(q)),
      );
      modelsDiscovered = candidates.length;
      modelQueries = candidates.slice(0, Math.max(0, maxQueries - seedQueries.length));
      modelQueriesSkipped = candidates.length - modelQueries.length;
      opts.log(
        `  google shopping: ${modelsDiscovered} modelos descubiertos, ${modelQueries.length} búsquedas por modelo` +
          (modelQueriesSkipped ? ` (${modelQueriesSkipped} sin búsqueda propia por el límite maxQueries=${maxQueries})` : ''),
      );
      if (modelQueriesSkipped)
        warnings.push(`Google Shopping: ${modelQueriesSkipped} modelos sin búsqueda propia por el límite maxQueries=${maxQueries}; pueden faltar medidas.`);
      const byModel = await runQueriesWithRetry(modelQueries, cfg, warnings);
      items = items.concat(byModel.items);
      cost += byModel.cost;
      failed += byModel.failed;
    }

    const products = groupShoppingItems(items, cfg).slice(0, opts.maxProducts);
    const sellerItems = items.filter((i) => isSeller(i, cfg.seller)).length;
    const variants = products.reduce((n, p) => n + p.variants.length, 0);
    opts.log(`  google shopping: ${items.length} resultados, ${sellerItems} del vendedor → ${products.length} modelos, ${variants} variantes (coste ${cost.toFixed(4)} $)`);

    return {
      platform: 'google_shopping',
      products,
      warnings,
      // Shopping no devuelve siempre los mismos resultados: un modelo se da por retirado tras 3 días sin verlo
      removalGraceDays: 3,
      diagnostics: {
        source: 'google_shopping',
        seller: cfg.seller,
        queries: seedQueries.length + modelQueries.length,
        failedQueries: failed,
        modelsDiscovered,
        modelQueriesSkipped,
        resultsFound: items.length,
        sellerResults: sellerItems,
        models: products.length,
        variants,
        costUsd: Math.round(cost * 10000) / 10000,
      },
      error: products.length
        ? undefined
        : sellerItems
          ? 'Google Shopping: hay resultados del vendedor, pero ninguno con precio.'
          : `Google Shopping: ningún resultado del vendedor «${cfg.seller}» en ${seedQueries.length + modelQueries.length} búsquedas (${items.length} resultados de otros vendedores).`,
    };
  },
};
