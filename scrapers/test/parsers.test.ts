import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapShopifyProduct } from '../src/adapters/shopify.js';
import { mapWooProduct } from '../src/adapters/woocommerce.js';
import {
  collectUrls,
  extractLocs,
  genericFailure,
  isLikelyProductUrl,
  isSitemapIndex,
  matchesInclude,
  compilePatterns,
  parseProductPage,
  type SitemapStats,
} from '../src/adapters/generic.js';
import { computeVariantEvents, discountPct, safeToMarkRemoved } from '../src/diff.js';
import { dedupe } from '../src/persist.js';
import { normalizeBase, parsePrice } from '../src/http.js';

describe('parsePrice', () => {
  it('entiende formatos europeos, anglosajones y unidades menores', () => {
    expect(parsePrice('1.299,00 €')).toBe(1299);
    expect(parsePrice('1,299.50')).toBe(1299.5);
    expect(parsePrice('349.00')).toBe(349);
    expect(parsePrice(299)).toBe(299);
    expect(parsePrice('129900', 2)).toBe(1299);
    expect(parsePrice('')).toBeNull();
    expect(parsePrice(null)).toBeNull();
  });
  it('normaliza la URL base', () => {
    expect(normalizeBase('flex.es')).toBe('https://flex.es');
    expect(normalizeBase('https://www.dormideo.com/')).toBe('https://www.dormideo.com');
  });
});

describe('Shopify', () => {
  const product = {
    id: 111,
    title: 'Colchón Híbrido',
    handle: 'colchon-hibrido',
    body_html: '<p>Muelles <b>ensacados</b> &amp; viscoelástica</p>',
    vendor: 'Dormideo',
    product_type: 'Colchones',
    options: [{ name: 'Medida', position: 1 }],
    images: [{ src: 'https://cdn.shopify.com/a.jpg' }],
    variants: [
      { id: 1, title: '90x190', sku: 'H-90', price: '299.00', compare_at_price: '399.00', available: true, option1: '90x190' },
      { id: 2, title: '150x190', sku: 'H-150', price: '499.00', compare_at_price: null, available: false, option1: '150x190' },
    ],
  };
  it('mapea producto, variantes, precio tachado y disponibilidad', () => {
    const p = mapShopifyProduct(product, 'https://www.dormideo.com');
    expect(p.url).toBe('https://www.dormideo.com/products/colchon-hibrido');
    expect(p.category).toBe('Colchones');
    expect(p.description).toBe('Muelles ensacados & viscoelástica');
    expect(p.variants[0]).toMatchObject({ externalId: '1', price: 299, compareAtPrice: 399, available: true, options: { Medida: '90x190' } });
    expect(p.variants[1]).toMatchObject({ price: 499, compareAtPrice: null, available: false });
  });
  it('ignora un precio tachado igual o inferior al precio', () => {
    const p = mapShopifyProduct(
      { ...product, variants: [{ ...product.variants[0], compare_at_price: '299.00' }] },
      'https://x.com',
    );
    expect(p.variants[0].compareAtPrice).toBeNull();
  });
});

describe('WooCommerce', () => {
  const prices = (price: string, regular: string) => ({
    price,
    regular_price: regular,
    sale_price: price,
    currency_code: 'EUR',
    currency_minor_unit: 2,
  });
  it('mapea un producto simple con descuento', () => {
    const p = mapWooProduct({
      id: 5,
      name: 'Almohada Visco &amp; Gel',
      type: 'simple',
      permalink: 'https://tienda.es/almohada',
      sku: 'ALM',
      prices: prices('3990', '4990'),
      is_in_stock: true,
      categories: [{ name: 'Almohadas' }],
    });
    expect(p.title).toBe('Almohada Visco & Gel');
    expect(p.variants).toEqual([
      expect.objectContaining({ externalId: '5', price: 39.9, compareAtPrice: 49.9, available: true, currency: 'EUR' }),
    ]);
  });
  it('mapea un producto variable con sus variaciones', () => {
    const parent = {
      id: 10,
      name: 'Colchón Pro',
      type: 'variable',
      permalink: 'https://tienda.es/colchon-pro',
      prices: prices('29900', '29900'),
      variations: [
        { id: 11, attributes: [{ name: 'Medida', value: '90x190' }] },
        { id: 12, attributes: [{ name: 'Medida', value: '135x190' }] },
      ],
    };
    const v11 = { id: 11, name: 'Colchón Pro', type: 'variation', permalink: '', prices: prices('29900', '29900'), is_in_stock: true };
    const p = mapWooProduct(parent, [v11]);
    expect(p.variants[0]).toMatchObject({ externalId: '11', title: '90x190', price: 299, compareAtPrice: null, available: true });
    expect(p.variants[1]).toMatchObject({ externalId: '12', price: null }); // variación que no se pudo leer
  });
});

describe('Genérico (sitemap + JSON-LD)', () => {
  it('lee sitemaps e índices', () => {
    const index = `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://x.com/sitemap-products.xml</loc></sitemap></sitemapindex>`;
    expect(isSitemapIndex(index)).toBe(true);
    expect(extractLocs(index)).toEqual(['https://x.com/sitemap-products.xml']);
    const set = `<urlset><url><loc><![CDATA[https://x.com/p/a?x=1&amp;y=2]]></loc></url></urlset>`;
    expect(isSitemapIndex(set)).toBe(false);
    expect(extractLocs(set)).toEqual(['https://x.com/p/a?x=1&y=2']);
  });

  it('lee un Product con Offer y precio tachado', () => {
    const html = `<html><head><link rel="canonical" href="https://x.com/colchon-original">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"X"},
      {"@type":"Product","name":"Colchón Original","brand":{"@type":"Brand","name":"Emma"},"image":["https://x.com/i.jpg"],
       "offers":{"@type":"Offer","sku":"OR-90","price":"399.00","priceCurrency":"EUR","availability":"https://schema.org/InStock",
       "priceSpecification":[{"@type":"UnitPriceSpecification","priceType":"https://schema.org/StrikethroughPrice","price":"599.00"}]}}]}</script>
      </head></html>`;
    const p = parseProductPage(html, 'https://x.com/colchon-original?utm=1')!;
    expect(p).toMatchObject({ externalId: 'https://x.com/colchon-original', title: 'Colchón Original', vendor: 'Emma', imageUrl: 'https://x.com/i.jpg' });
    expect(p.variants).toEqual([
      expect.objectContaining({ externalId: 'OR-90', price: 399, compareAtPrice: 599, available: true, currency: 'EUR' }),
    ]);
  });

  it('lee un ProductGroup con variantes por medida', () => {
    const html = `<script type="application/ld+json">[{"@type":"ProductGroup","name":"Colchón Híbrido","productGroupID":"HY",
      "hasVariant":[
        {"@type":"Product","sku":"HY-90","name":"Colchón Híbrido 90x190","size":"90x190","offers":{"@type":"Offer","price":449,"priceCurrency":"EUR","availability":"https://schema.org/OutOfStock"}},
        {"@type":"Product","sku":"HY-135","name":"Colchón Híbrido 135x190","size":"135x190","offers":{"@type":"Offer","price":649,"priceCurrency":"EUR","availability":"https://schema.org/InStock"}}
      ]}]</script>`;
    const p = parseProductPage(html, 'https://x.com/hibrido')!;
    expect(p.variants).toHaveLength(2);
    expect(p.variants[0]).toMatchObject({ externalId: 'HY-90', price: 449, available: false, options: { size: '90x190' } });
    expect(p.variants[1]).toMatchObject({ externalId: 'HY-135', price: 649, available: true });
  });

  it('acepta AggregateOffer y descarta páginas sin producto', () => {
    const agg = `<script type="application/ld+json">{"@type":"Product","name":"Almohada","offers":{"@type":"AggregateOffer","lowPrice":"49","highPrice":"79","priceCurrency":"EUR"}}</script>`;
    expect(parseProductPage(agg, 'https://x.com/a')!.variants[0]).toMatchObject({ price: 49 });
    expect(parseProductPage('<script type="application/ld+json">{"@type":"WebPage"}</script>', 'https://x.com')).toBeNull();
    expect(parseProductPage('<script type="application/ld+json">{malformed</script>', 'https://x.com')).toBeNull();
  });
});

describe('Detección de cambios', () => {
  const v = (price: number | null, compareAtPrice: number | null, available: boolean | null) => ({
    externalId: '1', title: null, sku: null, options: null, currency: 'EUR', price, compareAtPrice, available,
  });
  const prev = (price: number, compare: number | null, available: boolean) => ({
    variant_id: 'v', captured_on: '2026-11-16', price: String(price), compare_at_price: compare === null ? null : String(compare), available,
  });

  it('sin histórico no hay eventos', () => {
    expect(computeVariantEvents(undefined, v(100, null, true))).toEqual([]);
  });
  it('detecta bajada de precio con inicio de descuento', () => {
    const events = computeVariantEvents(prev(500, null, true), v(400, 500, true));
    expect(events.map((e) => e.type)).toEqual(['price_change', 'discount_start']);
    expect(events[0].new_value).toMatchObject({ price: 400, change_pct: -20 });
    expect(events[1].new_value).toMatchObject({ discount_pct: 20 });
  });
  it('detecta fin de descuento y roturas de stock', () => {
    expect(computeVariantEvents(prev(400, 500, true), v(500, null, false)).map((e) => e.type)).toEqual([
      'price_change', 'discount_end', 'out_of_stock',
    ]);
    expect(computeVariantEvents(prev(400, null, false), v(400, null, true)).map((e) => e.type)).toEqual(['back_in_stock']);
  });
  it('sin cambios no hay eventos', () => {
    expect(computeVariantEvents(prev(400, 500, true), v(400, 500, true))).toEqual([]);
  });
  it('calcula el % de descuento y protege ante capturas incompletas', () => {
    expect(discountPct({ price: 75, compareAtPrice: 100 })).toBe(25);
    expect(safeToMarkRemoved(100, 30)).toBe(false);
    expect(safeToMarkRemoved(100, 95)).toBe(true);
    expect(safeToMarkRemoved(0, 0)).toBe(true);
  });
  it('elimina duplicados de la captura', () => {
    const p = { externalId: 'a', url: '', title: 'A', category: null, vendor: null, imageUrl: null, description: null, variants: [v(1, null, true), v(2, null, true)] };
    const out = dedupe([p, { ...p, title: 'A2' }]);
    expect(out).toHaveLength(1);
    expect(out[0].variants).toHaveLength(1);
  });
});

describe('Shopify por ficha (.js)', () => {
  it('mapea /products/{handle}.js con precios en céntimos', async () => {
    const { mapShopifyJsProduct, productHandles } = await import('../src/adapters/shopify.js');
    const p = mapShopifyJsProduct(
      {
        id: 9,
        title: 'El Marmota',
        handle: 'el-marmota',
        type: 'Colchones',
        featured_image: '//cdn.shopify.com/m.jpg',
        options: [{ name: 'Medida', position: 1 }],
        variants: [
          { id: 91, title: '90x190', sku: 'M90', price: 29900, compare_at_price: 39900, available: true, option1: '90x190' },
          { id: 92, title: '135x190', sku: 'M135', price: 44900, compare_at_price: null, available: false, option1: '135x190' },
        ],
      },
      'https://comounamarmota.com',
    );
    expect(p).toMatchObject({ externalId: '9', url: 'https://comounamarmota.com/products/el-marmota', category: 'Colchones', imageUrl: 'https://cdn.shopify.com/m.jpg' });
    expect(p.variants[0]).toMatchObject({ price: 299, compareAtPrice: 399, available: true, options: { Medida: '90x190' } });
    expect(p.variants[1]).toMatchObject({ price: 449, compareAtPrice: null, available: false });
    expect(
      productHandles([
        'https://x.com/products/a',
        'https://x.com/collections/c/products/a',
        'https://x.com/products/b/',
        'https://x.com/l/regalo-a',
        'https://x.com/pages/faq',
      ]),
    ).toEqual(['a', 'b']);
  });
});

describe('Categoría y duplicados', () => {
  it('saca la categoría de las migas de pan o de la URL', async () => {
    const { categoryFromBreadcrumbs, categoryFromUrl } = await import('../src/adapters/generic.js');
    const nodes = [
      { '@type': 'BreadcrumbList', itemListElement: [
        { position: 3, name: 'Colchón Emma Original' },
        { position: 1, name: 'Inicio' },
        { position: 2, name: 'Colchones' },
        { position: 2.5, name: 'Colchón Emma Original 25 cm' },
      ] },
    ];
    expect(categoryFromBreadcrumbs(nodes, 'Colchón Emma Original')).toBe('Colchones');
    expect(categoryFromBreadcrumbs([], 'x')).toBeNull();
    expect(categoryFromUrl('https://www.emma-colchon.es/colchones/colchon-emma-original/original/')).toBe('Colchones');
    expect(categoryFromUrl('https://www.emma-colchon.es/almohadas-emma/almohada-x/')).toBe('Almohadas emma');
    expect(categoryFromUrl('https://comounamarmota.com/products/el-marmota')).toBeNull();
    expect(categoryFromUrl('https://x.com/colchon-x/')).toBeNull();
  });

  it('se queda con la ficha principal cuando packs o landings repiten SKU', async () => {
    const { dedupeBySku } = await import('../src/adapters/generic.js');
    const mk = (url: string, skus: string[]) => ({
      externalId: url, url, title: 'Colchón Emma Original Pro+', category: null, vendor: null, imageUrl: null, description: null,
      variants: skus.map((sku) => ({ externalId: sku, title: null, sku, options: null, price: 1, compareAtPrice: null, available: true, currency: 'EUR' })),
    });
    const { products, dropped } = dedupeBySku([
      mk('https://e.es/packs-ahorro/pack-original-pro-plus/', ['A90', 'A135']),
      mk('https://e.es/colchones/colchon-emma-original-pro/original-pro-plus/', ['A90', 'A135', 'A150']),
      mk('https://e.es/packs-ahorro/super-pack-original-pro-plus/', ['A150']),
      mk('https://e.es/almohadas/almohada-x/', ['B1']),
      mk('https://e.es/almohadas/pack-almohadas-x/', ['B2']), // pack con SKU propio: se mantiene
    ]);
    expect(products.map((p) => p.url).sort()).toEqual([
      'https://e.es/almohadas/almohada-x/',
      'https://e.es/almohadas/pack-almohadas-x/',
      'https://e.es/colchones/colchon-emma-original-pro/original-pro-plus/',
    ]);
    expect(dropped).toHaveLength(2);
  });
});

describe('Valoraciones', () => {
  it('lee aggregateRating y lo normaliza a 5', async () => {
    const { ratingOf, parseProductPage } = await import('../src/adapters/generic.js');
    expect(ratingOf({ aggregateRating: { ratingValue: '4,7', reviewCount: '1532' } })).toEqual({ rating: 4.7, reviewCount: 1532 });
    expect(ratingOf({ aggregateRating: { ratingValue: 9, bestRating: 10, ratingCount: 20 } })).toEqual({ rating: 4.5, reviewCount: 20 });
    expect(ratingOf({})).toEqual({ rating: null, reviewCount: null });
    const html = `<script type="application/ld+json">{"@type":"Product","name":"A","aggregateRating":{"ratingValue":4.8,"reviewCount":321},
      "offers":{"@type":"Offer","price":10,"hasMerchantReturnPolicy":{"merchantReturnDays":100}}}</script>`;
    const p = parseProductPage(html, 'https://x.com/a')!;
    expect(p).toMatchObject({ rating: 4.8, reviewCount: 321, raw: { returnDays: 100 } });
  });
});

describe('Genérico: sitemaps osCommerce con prólogo roto (Maxcolchón)', () => {
  const index = `<?phpxml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://www.mx.com/contenido.xml</loc></sitemap>
  <sitemap><loc>https://www.mx.com/productos.xml</loc></sitemap>
  <sitemap><loc>https://www.mx.com/listados.xml</loc></sitemap>
</sitemapindex>`;
  const productos = `<?xml version="1.0" encoding="UTF-8"?><urlset>
  <url><loc>https://www.mx.com/colchones-viscoelasticos-c-12/colchon-viscoelastico-confort-p-101</loc></url>
  <url><loc>https://www.mx.com/colchones-c-1/colchon-muelles-ensacados-p-202</loc></url>
  <url><loc>https://www.mx.com/sabanas-c-33/juego-de-sabanas-5050-lisos-bies-p-512</loc></url>
  <url><loc>https://www.mx.com/camas-nido-c-27/base-tapizada-canguro-p-770</loc></url>
</urlset>`;

  afterEach(() => vi.unstubAllGlobals());

  it('tolera la instrucción de procesamiento rota y lee el índice', () => {
    expect(isSitemapIndex(index)).toBe(true);
    expect(extractLocs(index)).toHaveLength(3);
  });

  it('reconoce fichas -p-123 y filtra por patrones de la web', () => {
    expect(isLikelyProductUrl('https://www.mx.com/sabanas-c-33/juego-p-512')).toBe(true);
    expect(isLikelyProductUrl('https://www.mx.com/sabanas-c-33/')).toBe(false);
    expect(isLikelyProductUrl('https://x.com/products/colchon')).toBe(true);
    const include = compilePatterns(['^/colchones[^/]*-c-\\d+/']);
    expect(matchesInclude('https://www.mx.com/colchones-c-1/colchon-p-202', include)).toBe(true);
    expect(matchesInclude('https://www.mx.com/colchones-viscoelasticos-c-12/x-p-101', include)).toBe(true);
    expect(matchesInclude('https://www.mx.com/sabanas-c-33/juego-p-512', include)).toBe(false);
    expect(matchesInclude('https://www.mx.com/sabanas-c-33/juego-p-512', [])).toBe(true);
  });

  it('sigue primero el sitemap de productos y aplica el filtro de la web', async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      requested.push(url);
      const body = url.endsWith('/sitemap.xml') ? index : url.endsWith('/productos.xml') ? productos : null;
      return new Response(body ?? 'no', { status: body ? 200 : 404, headers: { 'content-type': 'application/xml' } });
    });
    const stats: SitemapStats = {
      robotsStatus: null, sitemaps: [], childSitemaps: 0, urlsFound: 0, urlsAfterFilter: 0, urlsLikelyProduct: 0, blockedBy: null,
    };
    const urls = await collectUrls('https://www.mx.com', () => {}, [], {
      includeUrlPatterns: ['^/colchones[^/]*-c-\\d+/'],
      stats,
    });
    expect(urls).toEqual([
      'https://www.mx.com/colchones-viscoelasticos-c-12/colchon-viscoelastico-confort-p-101',
      'https://www.mx.com/colchones-c-1/colchon-muelles-ensacados-p-202',
    ]);
    expect(requested).not.toContain('https://www.mx.com/contenido.xml'); // el de productos ya ha dado URLs
    expect(stats).toMatchObject({ robotsStatus: 404, childSitemaps: 3, urlsFound: 4, urlsAfterFilter: 2, urlsLikelyProduct: 2 });
  });

  it('detecta el bloqueo de Cloudflare y lo explica', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response('<title>Just a moment...</title>', { status: 403, headers: { server: 'cloudflare', 'cf-mitigated': 'challenge' } }),
    );
    const warnings: string[] = [];
    const stats: SitemapStats = {
      robotsStatus: null, sitemaps: [], childSitemaps: 0, urlsFound: 0, urlsAfterFilter: 0, urlsLikelyProduct: 0, blockedBy: null,
    };
    expect(await collectUrls('https://www.mx.com', () => {}, warnings, { stats })).toEqual([]);
    expect(stats.blockedBy).toBe('Cloudflare');
    expect(stats.robotsStatus).toBe(403);
    const msg = genericFailure({ ...stats, pagesVisited: 0, htmlPages: 0, pagesWithoutProduct: 0, blockedPages: 0 });
    expect(msg).toMatch(/anti-bots \(Cloudflare\).*HTTP 403/);
  });

  it('distingue 0 URLs en el sitemap, 0 tras filtrar y fichas sin JSON-LD', () => {
    const base = { sitemaps: [{ url: 's', status: 200 }], blockedBy: null, pagesVisited: 0, htmlPages: 0, pagesWithoutProduct: 0, blockedPages: 0 };
    expect(genericFailure({ ...base, urlsFound: 0, urlsAfterFilter: 0 })).toMatch(/^0 URLs de ficha en el sitemap \(/);
    expect(genericFailure({ ...base, urlsFound: 400, urlsAfterFilter: 0 }, ['^/colchones'])).toMatch(/tras filtrar.*\^\/colchones/);
    expect(genericFailure({ ...base, urlsFound: 400, urlsAfterFilter: 50, pagesVisited: 50, htmlPages: 50, pagesWithoutProduct: 50 })).toMatch(
      /^Fichas sin JSON-LD Product: 50\/50/,
    );
  });
});

describe('Genérico: ficha con AggregateOffer e ImageObject (Maxcolchón)', () => {
  const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
  const related = Array.from({ length: 15 }, (_, i) =>
    ld({ '@context': 'https://schema.org', '@type': 'ImageObject', name: `Otro producto ${i}`, contentUrl: `https://img/${i}.jpg` }),
  ).join('\n');
  const html = `<html><head><link rel="canonical" href="https://www.mx.com/colchones-c-1/colchon-muelles-ensacados-p-202">
    ${ld({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio' }, { '@type': 'ListItem', position: 2, name: 'Colchones' },
      { '@type': 'ListItem', position: 3, name: 'Colchón Muelles Ensacados' }] })}
    ${related}
    ${ld({ '@context': 'https://schema.org', '@type': 'Product', name: 'Colchón Muelles Ensacados', productId: '202',
      url: 'https://www.mx.com/colchones-c-1/colchon-muelles-ensacados-p-202', category: 'Colchones',
      image: 'https://img/202.jpg', brand: { '@type': 'Brand', name: 'Maxcolchón' },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.7', ratingCount: '120', reviewCount: '98' },
      offers: { '@type': 'AggregateOffer', lowPrice: '219.00', highPrice: '459.00', priceCurrency: 'EUR',
        offers: { '@type': ['Offer', 'PriceSpecification'], price: null, availability: 'https://schema.org/InStock', priceValidUntil: '2026-12-31' } } })}
    ${ld({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Maxcolchón' })}
  </head></html>`;

  it('usa el bloque Product, guarda el precio «desde», highPrice y la valoración', () => {
    const p = parseProductPage(html, 'https://www.mx.com/colchones-c-1/colchon-muelles-ensacados-p-202')!;
    expect(p).toMatchObject({
      title: 'Colchón Muelles Ensacados',
      category: 'Colchones',
      vendor: 'Maxcolchón',
      imageUrl: 'https://img/202.jpg',
      rating: 4.7,
      reviewCount: 98,
    });
    expect(p.variants).toEqual([
      expect.objectContaining({ title: 'Desde', price: 219, compareAtPrice: null, available: true, currency: 'EUR' }),
    ]);
    expect(p.raw).toMatchObject({ priceRange: { lowPrice: 219, highPrice: 459 }, productId: '202' });
  });

  it('en un AggregateOffer, highPrice no se toma como precio tachado', () => {
    const agg = ld({ '@type': 'Product', name: 'Almohada', offers: { '@type': 'AggregateOffer', lowPrice: '49', highPrice: '79', priceCurrency: 'EUR' } });
    expect(parseProductPage(agg, 'https://x.com/a')!.variants[0]).toMatchObject({ price: 49, compareAtPrice: null, title: 'Desde' });
  });

  it('ignora páginas que solo tienen ImageObject', () => {
    expect(parseProductPage(related, 'https://www.mx.com/x')).toBeNull();
  });
});
