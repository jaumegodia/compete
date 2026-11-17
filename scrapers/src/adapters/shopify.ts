import { getJson, getText, parsePrice, sleep } from '../http.js';
import { stripHtml } from '../text.js';
import { collectUrls, dedupeBySku, parseProductPage } from './generic.js';
import type { Adapter, ScrapedProduct, ScrapeOptions, ScrapeResult } from '../types.js';

/**
 * Shopify, en dos modos:
 * 1. /products.json → catálogo completo en pocas peticiones (lo normal).
 * 2. Si la tienda lo tiene bloqueado: URLs /products/{handle} del sitemap → /products/{handle}.js por ficha,
 *    que también trae precio tachado y stock por variante. Si .js tampoco responde, se leen los datos
 *    schema.org de la ficha (como el adaptador genérico).
 */

// Estructura relevante de /products.json (precios en texto, "299.00")
export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html?: string | null;
  vendor?: string | null;
  product_type?: string | null;
  tags?: string[] | string;
  options?: { name: string; position: number }[];
  images?: { src: string }[];
  variants: {
    id: number;
    title: string;
    sku?: string | null;
    price: string;
    compare_at_price?: string | null;
    available?: boolean;
    option1?: string | null;
    option2?: string | null;
    option3?: string | null;
  }[];
}

// Estructura relevante de /products/{handle}.js (precios en céntimos, 29900)
export interface ShopifyJsProduct {
  id: number;
  title: string;
  handle: string;
  description?: string | null;
  vendor?: string | null;
  type?: string | null;
  tags?: string[];
  images?: string[];
  featured_image?: string | null;
  options?: ({ name: string; position: number } | string)[];
  variants: {
    id: number;
    title: string;
    sku?: string | null;
    price: number;
    compare_at_price?: number | null;
    available?: boolean;
    option1?: string | null;
    option2?: string | null;
    option3?: string | null;
  }[];
}

const PAGE_SIZE = 250;

type AnyVariant = ShopifyProduct['variants'][number] | ShopifyJsProduct['variants'][number];

function mapVariants(
  variants: AnyVariant[],
  optionNames: string[],
  toPrice: (v: unknown) => number | null,
  currency: string,
) {
  return variants.map((v) => {
    const values = [v.option1, v.option2, v.option3];
    const options: Record<string, string> = {};
    optionNames.forEach((name, i) => {
      if (values[i]) options[name] = values[i] as string;
    });
    const price = toPrice(v.price);
    const compare = toPrice(v.compare_at_price);
    return {
      externalId: String(v.id),
      title: v.title === 'Default Title' ? null : v.title,
      sku: v.sku || null,
      options: Object.keys(options).length ? options : null,
      price,
      compareAtPrice: compare !== null && price !== null && compare > price ? compare : null,
      available: v.available ?? null,
      currency,
    };
  });
}

export function mapShopifyProduct(p: ShopifyProduct, baseUrl: string, currency = 'EUR'): ScrapedProduct {
  const optionNames = [...(p.options ?? [])].sort((a, b) => a.position - b.position).map((o) => o.name);
  return {
    externalId: String(p.id),
    url: `${baseUrl}/products/${p.handle}`,
    title: p.title,
    category: p.product_type || null,
    vendor: p.vendor || null,
    imageUrl: p.images?.[0]?.src ?? null,
    description: stripHtml(p.body_html),
    raw: { handle: p.handle, tags: p.tags },
    variants: mapVariants(p.variants, optionNames, (v) => parsePrice(v), currency),
  };
}

export function mapShopifyJsProduct(p: ShopifyJsProduct, baseUrl: string, currency = 'EUR'): ScrapedProduct {
  const optionNames = (p.options ?? []).map((o) => (typeof o === 'string' ? o : o.name));
  const image = p.featured_image ?? p.images?.[0] ?? null;
  return {
    externalId: String(p.id),
    url: `${baseUrl}/products/${p.handle}`,
    title: p.title,
    category: p.type || null,
    vendor: p.vendor || null,
    imageUrl: image ? (image.startsWith('//') ? `https:${image}` : image) : null,
    description: stripHtml(p.description),
    raw: { handle: p.handle, tags: p.tags, source: 'product.js' },
    variants: mapVariants(p.variants, optionNames, (v) => (v === null || v === undefined ? null : parsePrice(v, 2)), currency),
  };
}

/** Extrae los handles únicos de las URLs /products/{handle} (también /collections/x/products/{handle}). */
export function productHandles(urls: string[]): string[] {
  const handles = new Set<string>();
  for (const u of urls) {
    try {
      const m = new URL(u).pathname.match(/\/products\/([^/?#]+)\/?$/);
      if (m) handles.add(decodeURIComponent(m[1]));
    } catch {
      /* URL no válida */
    }
  }
  return [...handles];
}

async function scrapeCatalogJson(baseUrl: string, opts: ScrapeOptions): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];
  for (let page = 1; products.length < opts.maxProducts; page++) {
    const data = await getJson<{ products: ShopifyProduct[] }>(
      `${baseUrl}/products.json?limit=${PAGE_SIZE}&page=${page}`,
      { retries: 1 },
    );
    if (!Array.isArray(data.products)) throw new Error('products.json sin lista de productos');
    if (!data.products.length) break;
    products.push(...data.products.map((p) => mapShopifyProduct(p, baseUrl)));
    opts.log(`  shopify: página ${page}, ${products.length} productos`);
    if (data.products.length < PAGE_SIZE) break;
    await sleep(opts.delayMs);
  }
  return products.slice(0, opts.maxProducts);
}

async function scrapeByProductPages(baseUrl: string, opts: ScrapeOptions, warnings: string[]): Promise<ScrapedProduct[]> {
  const handles = productHandles(await collectUrls(baseUrl, opts.log, warnings)).slice(0, opts.maxProducts);
  opts.log(`  shopify (por ficha): ${handles.length} productos en el sitemap`);
  const products: ScrapedProduct[] = [];
  let jsFailures = 0;
  let jsOk = 0;
  for (const [i, handle] of handles.entries()) {
    const url = `${baseUrl}/products/${encodeURIComponent(handle)}`;
    try {
      // Si .js no responde en las primeras fichas, se deja de intentar y se lee directamente el HTML
      if (jsOk > 0 || jsFailures < 3) {
        try {
          products.push(mapShopifyJsProduct(await getJson<ShopifyJsProduct>(`${url}.js`, { retries: 1 }), baseUrl));
          jsOk++;
          continue;
        } catch (e) {
          jsFailures++;
          if (jsFailures === 1) warnings.push(`Primer fallo en .js (${url}.js): ${(e as Error).message}`);
        }
      }
      const { text } = await getText(url, { retries: 1, accept: 'text/html' });
      const p = parseProductPage(text, url);
      if (p) products.push(p);
    } catch (e) {
      warnings.push(`${url}: ${(e as Error).message}`);
    } finally {
      if ((i + 1) % 25 === 0) opts.log(`  shopify (por ficha): ${i + 1}/${handles.length}`);
      await sleep(opts.delayMs);
    }
  }
  if (jsFailures) warnings.push(`${jsFailures} fichas sin respuesta en .js: leídas por HTML (sin precio tachado).`);
  return dedupeBySku(products).products;
}

export const shopifyAdapter: Adapter = {
  platform: 'shopify',
  async scrape(baseUrl, opts): Promise<ScrapeResult> {
    const warnings: string[] = [];
    let products: ScrapedProduct[];
    try {
      products = await scrapeCatalogJson(baseUrl, opts);
      if (!products.length) throw new Error('products.json vacío');
    } catch (e) {
      opts.log(`  shopify: products.json no disponible (${(e as Error).message}); se lee ficha a ficha`);
      products = await scrapeByProductPages(baseUrl, opts, warnings);
    }
    return { platform: 'shopify', products, warnings };
  },
};

const SHOPIFY_HTML = /cdn\.shopify\.com|myshopify\.com|Shopify\.theme|window\.Shopify|shopify-section/i;

/** ¿Es una tienda Shopify? Primero por su catálogo público y, si está bloqueado, por el HTML de la portada. */
export async function isShopify(baseUrl: string): Promise<boolean> {
  try {
    const data = await getJson<{ products?: unknown[] }>(`${baseUrl}/products.json?limit=1`, { retries: 1 });
    if (Array.isArray(data.products)) return true;
  } catch {
    /* bloqueado o no es Shopify */
  }
  try {
    const { text } = await getText(baseUrl, { retries: 1, accept: 'text/html' });
    return SHOPIFY_HTML.test(text);
  } catch {
    return false;
  }
}
