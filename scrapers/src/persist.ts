import type { SupabaseClient } from '@supabase/supabase-js';
import { chunk, fetchAll, must } from './db.js';
import { computeVariantEvents, safeToMarkRemoved, type EventDraft, type Snapshot } from './diff.js';
import type { PromoSnapshot } from './promos.js';
import type { ScrapedProduct, ScrapeResult } from './types.js';

interface SiteRow {
  id: string;
  base_url: string;
  currency: string;
}

interface EventRow extends EventDraft {
  site_id: string;
  run_id: string;
  product_id: string | null;
  variant_id: string | null;
}

/** Elimina productos y variantes duplicados (una misma URL o id repetido en la captura). */
export function dedupe(products: ScrapedProduct[]): ScrapedProduct[] {
  const byId = new Map<string, ScrapedProduct>();
  for (const p of products) {
    if (byId.has(p.externalId)) continue;
    const seen = new Set<string>();
    byId.set(p.externalId, {
      ...p,
      variants: p.variants.filter((v) => (seen.has(v.externalId) ? false : (seen.add(v.externalId), true))),
    });
  }
  return [...byId.values()];
}

/** Guarda una captura en Supabase y genera los eventos de cambio. Devuelve nº de eventos y avisos. */
export async function persistScrape(
  db: SupabaseClient,
  site: SiteRow,
  runId: string,
  result: ScrapeResult,
  log: (m: string) => void,
): Promise<{ events: number; variants: number; warnings: string[] }> {
  const warnings: string[] = [];
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const products = dedupe(result.products);

  // 1. Estado anterior
  const existing = await fetchAll<{ id: string; external_id: string; removed_at: string | null }>((f, t) =>
    db.from('products').select('id, external_id, removed_at').eq('site_id', site.id).range(f, t),
  );
  const existingByExt = new Map(existing.map((p) => [p.external_id, p]));
  const activeBefore = existing.filter((p) => !p.removed_at).length;

  const lastSnapshots = await fetchAll<Snapshot>((f, t) =>
    db.rpc('latest_snapshots', { p_site_id: site.id }).range(f, t),
  );
  const prevByVariant = new Map(lastSnapshots.map((s) => [s.variant_id, s]));

  // 2. Productos
  const productIdByExt = new Map<string, string>();
  for (const batch of chunk(products, 200)) {
    const rows = batch.map((p) => ({
      site_id: site.id,
      external_id: p.externalId,
      url: p.url,
      title: p.title,
      category: p.category,
      vendor: p.vendor,
      image_url: p.imageUrl,
      description: p.description,
      raw: p.raw ?? null,
      rating: p.rating ?? null,
      review_count: p.reviewCount ?? null,
      last_seen_at: now,
      removed_at: null,
    }));
    const data = must(
      await db.from('products').upsert(rows, { onConflict: 'site_id,external_id' }).select('id, external_id'),
      'upsert products',
    );
    data.forEach((r: { id: string; external_id: string }) => productIdByExt.set(r.external_id, r.id));
  }

  const events: EventRow[] = [];
  const ev = (d: EventDraft, productId: string | null, variantId: string | null) =>
    events.push({ ...d, site_id: site.id, run_id: runId, product_id: productId, variant_id: variantId });

  for (const p of products) {
    const before = existingByExt.get(p.externalId);
    if (!before || before.removed_at) {
      // Sin eventos en la primera captura de una web: todo sería "nuevo"
      if (existing.length > 0) {
        ev(
          {
            type: 'new_product',
            old_value: before ? { relisted: true } : null,
            new_value: { title: p.title, url: p.url, price_from: minPrice(p) },
          },
          productIdByExt.get(p.externalId) ?? null,
          null,
        );
      }
    }
  }

  // 3. Variantes y precios
  const variantRows = products.flatMap((p) =>
    p.variants.map((v) => ({ productExt: p.externalId, v })),
  );
  let variantCount = 0;
  const seenVariantIds = new Set<string>();
  for (const batch of chunk(variantRows, 300)) {
    const rows = batch.map(({ productExt, v }) => ({
      product_id: productIdByExt.get(productExt)!,
      external_id: v.externalId,
      title: v.title,
      sku: v.sku,
      options: v.options,
      last_seen_at: now,
      removed_at: null,
      // Último precio conocido (el panel lo lee sin recorrer el histórico)
      current_price: v.price,
      current_compare_at_price: v.compareAtPrice,
      current_available: v.available,
      current_captured_on: today,
    }));
    const data = must(
      await db.from('variants').upsert(rows, { onConflict: 'product_id,external_id' }).select('id, product_id, external_id'),
      'upsert variants',
    ) as { id: string; product_id: string; external_id: string }[];
    const idByKey = new Map(data.map((r) => [`${r.product_id}|${r.external_id}`, r.id]));

    const snapshots = batch.map(({ productExt, v }) => {
      const productId = productIdByExt.get(productExt)!;
      const variantId = idByKey.get(`${productId}|${v.externalId}`)!;
      seenVariantIds.add(variantId);
      computeVariantEvents(prevByVariant.get(variantId), v).forEach((d) => ev(d, productId, variantId));
      return {
        variant_id: variantId,
        captured_on: today,
        price: v.price,
        compare_at_price: v.compareAtPrice,
        currency: v.currency ?? site.currency,
        available: v.available,
        captured_at: now,
      };
    });
    must(
      await db.from('price_snapshots').upsert(snapshots, { onConflict: 'variant_id,captured_on' }),
      'upsert price_snapshots',
    );
    variantCount += batch.length;
  }

  // 4. Productos y variantes retirados
  const scrapedExt = new Set(products.map((p) => p.externalId));
  const missing = existing.filter((p) => !p.removed_at && !scrapedExt.has(p.external_id));
  if (missing.length) {
    if (safeToMarkRemoved(activeBefore, products.length)) {
      for (const batch of chunk(missing, 200)) {
        must(
          await db.from('products').update({ removed_at: now }).in('id', batch.map((p) => p.id)),
          'mark removed products',
        );
      }
      missing.forEach((p) => ev({ type: 'removed_product', old_value: null, new_value: null }, p.id, null));
    } else {
      warnings.push(
        `Captura sospechosa: ${products.length} productos frente a ${activeBefore} activos. No se marca ninguno como retirado.`,
      );
    }
  }
  const seenProductIds = [...productIdByExt.values()];
  for (const batch of chunk(seenProductIds, 200)) {
    const active = must(
      await db.from('variants').select('id').in('product_id', batch).is('removed_at', null),
      'select variants',
    ) as { id: string }[];
    const gone = active.filter((v) => !seenVariantIds.has(v.id)).map((v) => v.id);
    if (gone.length) must(await db.from('variants').update({ removed_at: now }).in('id', gone), 'mark removed variants');
  }

  // 5. Eventos
  for (const batch of chunk(events, 500)) must(await db.from('events').insert(batch), 'insert events');
  log(`  guardado: ${products.length} productos, ${variantCount} variantes, ${events.length} eventos`);
  return { events: events.length, variants: variantCount, warnings };
}

function minPrice(p: ScrapedProduct): number | null {
  const prices = p.variants.map((v) => v.price).filter((x): x is number => x !== null);
  return prices.length ? Math.min(...prices) : null;
}

// ---------- Promociones de la home ----------

interface PromoRow {
  main_discount_pct: number | string | null;
  up_to: boolean;
  codes: string[];
  campaigns: string[];
  free_shipping: boolean;
}

const promoKey = (p: PromoRow) =>
  JSON.stringify([
    p.main_discount_pct === null ? null : Number(p.main_discount_pct),
    p.up_to,
    [...p.codes].sort(),
    [...p.campaigns].sort(),
    p.free_shipping,
  ]);

/** ¿Ha cambiado la promoción comunicada respecto a la última captura? */
export function promoChanged(prev: PromoRow | null, curr: PromoRow): boolean {
  return prev !== null && promoKey(prev) !== promoKey(curr);
}

/** Guarda la promoción del día y crea un evento promo_change si es distinta de la anterior. */
export async function persistPromos(
  db: SupabaseClient,
  siteId: string,
  runId: string | null,
  promo: PromoSnapshot,
): Promise<boolean> {
  const prev = must(
    await db
      .from('site_promotions')
      .select('main_discount_pct, up_to, codes, campaigns, free_shipping')
      .eq('site_id', siteId)
      .order('captured_on', { ascending: false })
      .limit(1)
      .maybeSingle(),
    'select site_promotions',
  ) as PromoRow | null;

  const row: PromoRow = {
    main_discount_pct: promo.mainDiscountPct,
    up_to: promo.upTo,
    codes: promo.codes,
    campaigns: promo.campaigns,
    free_shipping: promo.freeShipping,
  };
  must(
    await db.from('site_promotions').upsert(
      {
        site_id: siteId,
        captured_on: new Date().toISOString().slice(0, 10),
        captured_at: new Date().toISOString(),
        page_url: promo.pageUrl,
        messages: promo.messages,
        ...row,
      },
      { onConflict: 'site_id,captured_on' },
    ),
    'upsert site_promotions',
  );
  if (!promoChanged(prev, row)) return false;
  must(
    await db.from('events').insert({
      site_id: siteId,
      run_id: runId,
      type: 'promo_change',
      old_value: prev,
      new_value: { ...row, messages: promo.messages.slice(0, 5).map((m) => m.text) },
    }),
    'insert promo event',
  );
  return true;
}
