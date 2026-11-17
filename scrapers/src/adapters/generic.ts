import { getText, parsePrice, sleep } from '../http.js';
import { stripHtml } from './shopify.js';
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

async function collectUrls(baseUrl: string, log: (m: string) => void, warnings: string[]): Promise<string[]> {
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
  const category = first(product.category);

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
    category: category ? String(typeof category === 'object' ? category.name : category) : null,
    vendor: brand ? String(typeof brand === 'object' ? brand.name : brand) : null,
    imageUrl: image ? String(typeof image === 'object' ? image.url ?? image.contentUrl : image) : null,
    description: stripHtml(product.description ? String(product.description) : null),
    raw: { productGroupID: group?.productGroupID ?? null, sku: product.sku ?? null },
    variants,
  };
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
    return { platform: 'generic', products: [...products.values()], warnings };
  },
};
