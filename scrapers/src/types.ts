export type Platform = 'shopify' | 'woocommerce' | 'generic' | 'google_shopping';

export interface ScrapedVariant {
  externalId: string;
  title: string | null;
  sku: string | null;
  options: Record<string, string> | null;
  price: number | null;
  compareAtPrice: number | null; // precio tachado (null si no hay descuento)
  available: boolean | null;
  currency: string | null;
}

export interface ScrapedProduct {
  externalId: string;
  url: string;
  title: string;
  category: string | null;
  vendor: string | null;
  imageUrl: string | null;
  description: string | null;
  rating?: number | null; // valoración media (0-5)
  reviewCount?: number | null;
  raw?: unknown;
  variants: ScrapedVariant[];
}

export interface ScrapeResult {
  platform: Platform;
  products: ScrapedProduct[];
  warnings: string[];
  /** Datos de diagnóstico de la ejecución (sitemaps, códigos HTTP, recuentos); se guardan en scrape_runs.diagnostics. */
  diagnostics?: Record<string, unknown>;
  /**
   * Días sin ver un producto o variante antes de darlo por retirado (fuentes cuyo resultado varía
   * de un día a otro, como Google Shopping). Sin valor: se retira en cuanto falta en una captura.
   */
  removalGraceDays?: number;
  /** Motivo concreto cuando no se han obtenido productos. */
  error?: string;
}

export interface Adapter {
  platform: Platform;
  scrape(baseUrl: string, opts: ScrapeOptions): Promise<ScrapeResult>;
}

export interface ScrapeOptions {
  maxProducts: number; // límite de seguridad
  delayMs: number; // pausa entre peticiones a la misma web
  log: (msg: string) => void;
  /** Expresiones regulares (sobre la ruta de la URL) para quedarse solo con algunas fichas (sites.include_url_patterns). */
  includeUrlPatterns?: string[] | null;
  /** Configuración propia de la web (sites.scrape_config), p. ej. el vendedor en Google Shopping. */
  config?: Record<string, unknown> | null;
}
