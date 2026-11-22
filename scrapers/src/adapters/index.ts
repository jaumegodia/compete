import { genericAdapter } from './generic.js';
import { googleShoppingAdapter } from './google-shopping.js';
import { isShopify, shopifyAdapter } from './shopify.js';
import { isWooCommerce, wooAdapter } from './woocommerce.js';
import type { Adapter, Platform } from '../types.js';

export const adapters: Record<Platform, Adapter> = {
  shopify: shopifyAdapter,
  woocommerce: wooAdapter,
  generic: genericAdapter,
  google_shopping: googleShoppingAdapter, // solo si se configura en la web: no se detecta sola
};

/** Detecta la plataforma probando primero las APIs públicas (más fiables y baratas). */
export async function detectPlatform(baseUrl: string): Promise<Platform> {
  if (await isShopify(baseUrl)) return 'shopify';
  if (await isWooCommerce(baseUrl)) return 'woocommerce';
  return 'generic';
}
