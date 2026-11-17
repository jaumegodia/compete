import { getJson, parsePrice, sleep } from '../http.js';
import type { Adapter, ScrapedProduct, ScrapeResult } from '../types.js';

// Estructura relevante de /products.json (endpoint público de las tiendas Shopify)
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

const PAGE_SIZE = 250;

export function mapShopifyProduct(p: ShopifyProduct, baseUrl: string, currency = 'EUR'): ScrapedProduct {
  const optionNames = (p.options ?? []).sort((a, b) => a.position - b.position).map((o) => o.name);
  return {
    externalId: String(p.id),
    url: `${baseUrl}/products/${p.handle}`,
    title: p.title,
    category: p.product_type || null,
    vendor: p.vendor || null,
    imageUrl: p.images?.[0]?.src ?? null,
    description: stripHtml(p.body_html),
    raw: { handle: p.handle, tags: p.tags },
    variants: p.variants.map((v) => {
      const values = [v.option1, v.option2, v.option3];
      const options: Record<string, string> = {};
      optionNames.forEach((name, i) => {
        if (values[i]) options[name] = values[i] as string;
      });
      const price = parsePrice(v.price);
      const compare = parsePrice(v.compare_at_price);
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
    }),
  };
}

export function stripHtml(html?: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, 5000) : null;
}

export const shopifyAdapter: Adapter = {
  platform: 'shopify',
  async scrape(baseUrl, opts): Promise<ScrapeResult> {
    const products: ScrapedProduct[] = [];
    for (let page = 1; products.length < opts.maxProducts; page++) {
      const data = await getJson<{ products: ShopifyProduct[] }>(
        `${baseUrl}/products.json?limit=${PAGE_SIZE}&page=${page}`,
      );
      if (!data.products?.length) break;
      products.push(...data.products.map((p) => mapShopifyProduct(p, baseUrl)));
      opts.log(`  shopify: página ${page}, ${products.length} productos`);
      if (data.products.length < PAGE_SIZE) break;
      await sleep(opts.delayMs);
    }
    return { platform: 'shopify', products: products.slice(0, opts.maxProducts), warnings: [] };
  },
};

/** ¿Responde la web como una tienda Shopify? */
export async function isShopify(baseUrl: string): Promise<boolean> {
  try {
    const data = await getJson<{ products?: unknown[] }>(`${baseUrl}/products.json?limit=1`, { retries: 1 });
    return Array.isArray(data.products);
  } catch {
    return false;
  }
}
