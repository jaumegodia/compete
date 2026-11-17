import { getJson, parsePrice, sleep } from '../http.js';
import { stripHtml } from '../text.js';
import type { Adapter, ScrapedProduct, ScrapedVariant, ScrapeResult } from '../types.js';

// WooCommerce Store API (pública, sin claves): /wp-json/wc/store/v1/products
export interface WooPrices {
  price: string;
  regular_price: string;
  sale_price: string;
  currency_code: string;
  currency_minor_unit: number;
}

export interface WooProduct {
  id: number;
  name: string;
  type: string; // simple | variable | variation | grouped | external
  permalink: string;
  sku?: string;
  description?: string;
  short_description?: string;
  prices: WooPrices;
  is_in_stock?: boolean;
  is_purchasable?: boolean;
  images?: { src: string }[];
  categories?: { name: string }[];
  variations?: { id: number; attributes: { name: string; value: string }[] }[];
  variation?: string; // en variaciones: "Medida: 90x190"
}

const PAGE_SIZE = 100;
const STORE_API = '/wp-json/wc/store/v1';

export function mapWooPrices(p: WooPrices): Pick<ScrapedVariant, 'price' | 'compareAtPrice' | 'currency'> {
  const unit = p.currency_minor_unit ?? 2;
  const price = parsePrice(p.price, unit);
  const regular = parsePrice(p.regular_price, unit);
  return {
    price,
    compareAtPrice: regular !== null && price !== null && regular > price ? regular : null,
    currency: p.currency_code || null,
  };
}

export function mapWooProduct(p: WooProduct, variations: WooProduct[] = []): ScrapedProduct {
  const base = {
    externalId: String(p.id),
    url: p.permalink,
    title: decode(p.name),
    category: p.categories?.[0]?.name ? decode(p.categories[0].name) : null,
    vendor: null,
    imageUrl: p.images?.[0]?.src ?? null,
    description: stripHtml(p.short_description || p.description),
    raw: { type: p.type },
  };

  if (p.type === 'variable' && p.variations?.length) {
    const byId = new Map(variations.map((v) => [v.id, v]));
    return {
      ...base,
      variants: p.variations.map((ref) => {
        const v = byId.get(ref.id);
        const options = Object.fromEntries(ref.attributes.map((a) => [a.name, a.value]));
        return {
          externalId: String(ref.id),
          title: Object.values(options).join(' / ') || v?.variation || null,
          sku: v?.sku || null,
          options: Object.keys(options).length ? options : null,
          ...(v ? mapWooPrices(v.prices) : { price: null, compareAtPrice: null, currency: null }),
          available: v?.is_in_stock ?? null,
        };
      }),
    };
  }

  return {
    ...base,
    variants: [
      {
        externalId: String(p.id),
        title: null,
        sku: p.sku || null,
        options: null,
        ...mapWooPrices(p.prices),
        available: p.is_in_stock ?? null,
      },
    ],
  };
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&#8211;/g, '–').replace(/&#8217;/g, '’').replace(/&quot;/g, '"');

export const wooAdapter: Adapter = {
  platform: 'woocommerce',
  async scrape(baseUrl, opts): Promise<ScrapeResult> {
    const products: ScrapedProduct[] = [];
    const warnings: string[] = [];
    for (let page = 1; products.length < opts.maxProducts; page++) {
      const list = await getJson<WooProduct[]>(
        `${baseUrl}${STORE_API}/products?per_page=${PAGE_SIZE}&page=${page}`,
      );
      if (!list.length) break;
      for (const p of list) {
        let variations: WooProduct[] = [];
        if (p.type === 'variable' && p.variations?.length) {
          // La lista no trae precios por variación: se piden una a una
          for (const ref of p.variations) {
            try {
              variations.push(await getJson<WooProduct>(`${baseUrl}${STORE_API}/products/${ref.id}`));
            } catch (e) {
              warnings.push(`Variación ${ref.id} de ${p.permalink}: ${(e as Error).message}`);
            }
            await sleep(opts.delayMs);
          }
        }
        products.push(mapWooProduct(p, variations));
      }
      opts.log(`  woocommerce: página ${page}, ${products.length} productos`);
      if (list.length < PAGE_SIZE) break;
      await sleep(opts.delayMs);
    }
    return { platform: 'woocommerce', products: products.slice(0, opts.maxProducts), warnings };
  },
};

export async function isWooCommerce(baseUrl: string): Promise<boolean> {
  try {
    const data = await getJson<unknown>(`${baseUrl}${STORE_API}/products?per_page=1`, { retries: 1 });
    return Array.isArray(data);
  } catch {
    return false;
  }
}
