import { getText, parsePrice, sleep } from '../http.js';
import { stripHtml } from '../text.js';
import type { Adapter, ScrapedProduct, ScrapedVariant, ScrapeResult } from '../types.js';

/**
 * Adaptador genérico para webs que no son Shopify ni WooCommerce:
 * 1. Descubre las URLs en robots.txt / sitemap.xml.
 * 2. Visita cada página y lee los datos estructurados schema.org (JSON-LD) de tipo Product o ProductGroup,
 *    que casi todas las tiendas publican para Google Shopping.
 */

const EXCLUDE = /\/(blog|news|noticias|pages?|legal|privacidad|privacy|cookies|contact|contacto|faq|ayuda|help|account|cuenta|cart|carrito|checkout|search|tag|author)(\/|$)|\.(jpe?g|png|webp|gif|svg|pdf)$/i;
const PRODUCT_SITEMAP_HINT = /product|producto|catalog|articulo|item/i;

// ---------- Sitemaps ----------

export function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) =>
    m[1].replace(/&amp;/g, '&'),
  );
}

export const isSitemapIndex = (xml: string) => /<sitemapindex[\s>]/i.test(xml);

async function discoverSitemaps(baseUrl: string): Promise<string[]> {
  try {
    const { text } = await getText(`${baseUrl}/robots.txt`, { retries: 1 });
    const found = [...text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
    if (found.length) return found;
  } catch {
    /* sin robots.txt */
  }
  return [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_index.xml`];
}

export async function collectUrls(baseUrl: string, log: (m: string) => void, warnings: string[]): Promise<string[]> {
  const queue = await discoverSitemaps(baseUrl);
  const seen = new Set<string>();
  const urls = new Set<string>();
  while (queue.length && seen.size < 50) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    let xml: string;
    try {
      xml = (await getText(sm, { retries: 1 })).text;
    } catch (e) {
      warnings.push(`Sitemap ${sm}: ${(e as Error).message}`);
      continue;
    }
    const locs = extractLocs(xml);
    if (isSitemapIndex(xml)) {
      // Si hay sitemaps de producto, solo se siguen esos
      const productMaps = locs.filter((l) => PRODUCT_SITEMAP_HINT.test(l));
      queue.push(...(productMaps.length ? productMaps : locs));
    } else {
      locs.forEach((l) => urls.add(l));
    }
  }
  const host = new URL(baseUrl).host.replace(/^www\./, '');
  const filtered = [...urls].filter((u) => {
    try {
      return new URL(u).host.replace(/^www\./, '').endsWith(host) && !EXCLUDE.test(new URL(u).pathname);
    } catch {
      return false;
    }
  });
  log(`  generic: ${seen.size} sitemaps, ${filtered.length} URLs candidatas`);
  return filtered;
}

// ---------- JSON-LD ----------

type Json = Record<string, any>;

export function extractJsonLd(html: string): Json[] {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const out: Json[] = [];
  for (const b of blocks) {
    try {
      flatten(JSON.parse(b[1].trim()), out);
    } catch {
      /* JSON-LD mal formado: se ignora */
    }
  }
  return out;
}

function flatten(node: unknown, out: Json[]) {
  if (Array.isArray(node)) node.forEach((n) => flatten(n, out));
  else if (node && typeof node === 'object') {
    const obj = node as Json;
    if (Array.isArray(obj['@graph'])) flatten(obj['@graph'], out);
    out.push(obj);
  }
}

const hasType = (o: Json, t: string) => {
  const types = ([] as unknown[]).concat(o['@type'] ?? []);
  return types.some((x) => typeof x === 'string' && x.replace(/^.*[/#]/, '') === t);
};

const first = <T>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);

function offersOf(product: Json): Json[] {
  const offers = product.offers;
  if (!offers) return [];
  const list: Json[] = ([] as Json[]).concat(offers);
  return list.flatMap((o) => (hasType(o, 'AggregateOffer') && o.offers ? ([] as Json[]).concat(o.offers) : [o]));
}

function offerToVariant(o: Json, fallbackId: string, extra: Partial<ScrapedVariant> = {}): ScrapedVariant {
  const specs: Json[] = ([] as Json[]).concat(o.priceSpecification ?? []);
  const strike = specs.find((s) => /Strikethrough|ListPrice|SRP/i.test(String(s.priceType ?? '')));
  const priceSpec = specs.find((s) => s !== strike && s.price !== undefined);
  const price = parsePrice(o.price ?? o.lowPrice ?? priceSpec?.price);
  const compare = parsePrice(strike?.price ?? o.highPrice);
  const availability = String(o.availability ?? '');
  return {
    externalId: String(o.sku ?? extra.sku ?? o.url ?? fallbackId),
    title: null,
    sku: o.sku ? String(o.sku) : null,
    options: null,
    price,
    compareAtPrice: compare !== null && price !== null && compare > price ? compare : null,
    available: availability ? /InStock|LimitedAvailability|PreOrder|OnlineOnly/i.test(availability) : null,
    currency: o.priceCurrency ?? priceSpec?.priceCurrency ?? null,
    ...extra,
  };
}

const VARIANT_PROPS = ['size', 'color', 'material', 'pattern', 'width', 'height', 'depth'];

/** Convierte el HTML de una ficha en producto (o null si la página no es de producto). */
export function parseProductPage(html: string, pageUrl: string): ScrapedProduct | null {
  const nodes = extractJsonLd(html);
  const group = nodes.find((n) => hasType(n, 'ProductGroup'));
  const product = group ?? nodes.find((n) => hasType(n, 'Product'));
  if (!product) return null;

  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? pageUrl;
  const image = first(product.image);
  const brand = first(product.brand);
  const ldCategory = first(product.category);
  const category =
    (ldCategory ? String(typeof ldCategory === 'object' ? ldCategory.name : ldCategory) : null) ??
    categoryFromBreadcrumbs(nodes, String(product.name ?? '')) ??
    categoryFromUrl(canonical);

  let variants: ScrapedVariant[] = [];
  if (group && Array.isArray(group.hasVariant)) {
    variants = group.hasVariant.flatMap((v: Json, i: number) => {
      const options: Record<string, string> = {};
      for (const k of VARIANT_PROPS) if (v[k]) options[k] = String(typeof v[k] === 'object' ? v[k].name ?? '' : v[k]);
      return offersOf(v).slice(0, 1).map((o) =>
        offerToVariant(o, `${canonical}#${i}`, {
          title: v.name && v.name !== product.name ? String(v.name) : Object.values(options).join(' / ') || null,
          options: Object.keys(options).length ? options : null,
          ...(v.sku ? { sku: String(v.sku), externalId: String(v.sku) } : {}),
        }),
      );
    });
  } else {
    variants = offersOf(product).map((o, i) =>
      offerToVariant(o, `${canonical}#${i}`, { title: o.name ? String(o.name) : null }),
    );
  }
  // Ids de variante únicos dentro del producto
  const ids = new Set<string>();
  variants = variants.map((v, i) => {
    const id = ids.has(v.externalId) ? `${v.externalId}#${i}` : v.externalId;
    ids.add(id);
    return { ...v, externalId: id };
  });

  return {
    externalId: canonical,
    url: canonical,
    title: String(product.name ?? '').trim() || canonical,
    category,
    vendor: brand ? String(typeof brand === 'object' ? brand.name : brand) : null,
    imageUrl: image ? String(typeof image === 'object' ? image.url ?? image.contentUrl : image) : null,
    description: stripHtml(product.description ? String(product.description) : null),
    rating: ratingOf(product).rating,
    reviewCount: ratingOf(product).reviewCount,
    raw: {
      productGroupID: group?.productGroupID ?? null,
      sku: product.sku ?? null,
      returnDays: returnDaysOf(product),
    },
    variants,
  };
}

// ---------- Valoraciones y devoluciones ----------

/** Valoración media (normalizada a 0-5) y nº de reseñas desde aggregateRating. */
export function ratingOf(product: Json): { rating: number | null; reviewCount: number | null } {
  const r = first(product.aggregateRating) as Json | undefined;
  if (!r) return { rating: null, reviewCount: null };
  const value = parsePrice(r.ratingValue);
  const best = parsePrice(r.bestRating) ?? 5;
  const count = Number(r.reviewCount ?? r.ratingCount);
  return {
    rating: value === null || !best ? null : Math.round((value / best) * 5 * 100) / 100,
    reviewCount: Number.isFinite(count) ? count : null,
  };
}

/** Días de devolución (hasMerchantReturnPolicy.merchantReturnDays) si la web lo publica. */
function returnDaysOf(product: Json): number | null {
  for (const o of offersOf(product)) {
    const policy = first(o.hasMerchantReturnPolicy) as Json | undefined;
    const days = Number(policy?.merchantReturnDays);
    if (Number.isFinite(days) && days > 0) return days;
  }
  return null;
}

// ---------- Categoría ----------

const HOME = /^(inicio|home|portada|start)$/i;

/**
 * Categoría a partir de las migas de pan (BreadcrumbList): el primer nivel después de "Inicio"
 * (p. ej. "Colchones"), que es el que sirve para comparar marcas. Los niveles inferiores suelen ser
 * la gama o el propio producto.
 */
export function categoryFromBreadcrumbs(nodes: Json[], productName: string): string | null {
  const bc = nodes.find((n) => hasType(n, 'BreadcrumbList'));
  if (!bc || !Array.isArray(bc.itemListElement)) return null;
  const names = [...bc.itemListElement]
    .sort((a: Json, b: Json) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((i: Json) => String(i.name ?? (typeof i.item === 'object' ? i.item?.name : '') ?? '').trim())
    .filter((n) => n && !HOME.test(n));
  if (names.length && names.at(-1)!.toLowerCase() === productName.trim().toLowerCase()) names.pop();
  return names[0] ?? null;
}

const NON_CATEGORY_SEGMENTS = /^(products?|productos?|p|l|item|shop|tienda|es|en|ca)$/i;

/** Categoría a partir del primer tramo de la URL: /colchones/colchon-x/ → "Colchones". */
export function categoryFromUrl(url: string): string | null {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null; // /colchon-x/ no dice nada de la categoría
    const seg = segments[0];
    if (NON_CATEGORY_SEGMENTS.test(seg)) return null;
    const text = decodeURIComponent(seg).replace(/[-_]+/g, ' ').trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
  } catch {
    return null;
  }
}

// ---------- Duplicados ----------

const SECONDARY_PAGE = /pack|bundle|kit|lote|regalo|gift|oferta|promo|\/l\//i;

/**
 * Algunas webs publican en páginas de packs o landings los datos del producto principal (mismos SKU).
 * Se agrupan los productos que comparten algún SKU y se conserva la ficha principal:
 * la que no parece un pack/landing y, a igualdad, la de URL más corta.
 */
export function dedupeBySku(products: ScrapedProduct[]): { products: ScrapedProduct[]; dropped: string[] } {
  const parent = products.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  products.forEach((p, i) => {
    for (const v of p.variants) {
      if (!v.sku) continue;
      const j = owner.get(v.sku);
      if (j === undefined) owner.set(v.sku, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, number[]>();
  products.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));

  const score = (p: ScrapedProduct) => {
    const path = new URL(p.url).pathname;
    return (SECONDARY_PAGE.test(path) ? 10000 : 0) + path.length;
  };
  const kept: ScrapedProduct[] = [];
  const dropped: string[] = [];
  for (const idx of groups.values()) {
    const sorted = idx.map((i) => products[i]).sort((a, b) => score(a) - score(b));
    kept.push(sorted[0]);
    dropped.push(...sorted.slice(1).map((p) => p.url));
  }
  return { products: kept, dropped };
}

export const genericAdapter: Adapter = {
  platform: 'generic',
  async scrape(baseUrl, opts): Promise<ScrapeResult> {
    const warnings: string[] = [];
    const urls = await collectUrls(baseUrl, opts.log, warnings);
    const maxPages = Math.min(urls.length, opts.maxProducts * 3);
    const products = new Map<string, ScrapedProduct>();
    let visited = 0;
    for (const url of urls.slice(0, maxPages)) {
      if (products.size >= opts.maxProducts) break;
      visited++;
      try {
        const { text, contentType } = await getText(url, { retries: 1, accept: 'text/html' });
        if (!contentType.includes('html')) continue;
        const p = parseProductPage(text, url);
        if (p && !products.has(p.externalId)) products.set(p.externalId, p);
      } catch (e) {
        warnings.push(`${url}: ${(e as Error).message}`);
      }
      if (visited % 25 === 0) opts.log(`  generic: ${visited}/${maxPages} páginas, ${products.size} productos`);
      await sleep(opts.delayMs);
    }
    if (!products.size) warnings.push('No se ha encontrado ningún producto con datos JSON-LD: hará falta un adaptador a medida.');
    const { products: unique, dropped } = dedupeBySku([...products.values()]);
    if (dropped.length) opts.log(`  generic: ${dropped.length} páginas descartadas por repetir SKU de otro producto (packs, landings)`);
    return { platform: 'generic', products: unique, warnings };
  },
};
