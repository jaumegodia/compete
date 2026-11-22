import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  googleShoppingAdapter,
  groupShoppingItems,
  parseShoppingTitle,
  type ShoppingItem,
} from '../src/adapters/google-shopping.js';

const item = (title: string, price: number, old: number | null, extra: Partial<ShoppingItem> = {}): ShoppingItem => ({
  type: 'google_shopping_serp',
  title,
  price,
  old_price: old,
  currency: 'EUR',
  seller: 'Maxcolchon ES',
  ...extra,
});

describe('Google Shopping: títulos', () => {
  it('separa modelo, medida y detalle, y quita la marca', () => {
    expect(parseShoppingTitle('Colchón Intense 90x190', 'Maxcolchon')).toEqual({ model: 'Colchón Intense', size: '90x190', extra: null });
    expect(parseShoppingTitle('Maxcolchon Colchón Everest', 'Maxcolchon')).toEqual({ model: 'Colchón Everest', size: null, extra: null });
    expect(parseShoppingTitle('Colchón Intense Gemelos 150x200', 'Maxcolchon').model).toBe('Colchón Intense Gemelos');
    expect(parseShoppingTitle('Pack Colchón Luxe Graphene + Canapé + Almohada 135x190 (Cajón Pistón)', 'Maxcolchon')).toEqual({
      model: 'Pack Colchón Luxe Graphene + Canapé + Almohada',
      size: '135x190',
      extra: 'Cajón Pistón',
    });
    expect(parseShoppingTitle('Colchón 150 x 190 cm', 'X').size).toBe('150x190');
  });

  it('quita la marca también en medio o al final del título', () => {
    expect(parseShoppingTitle('Colchón Viscoelástico Gel Sport Alta Firmeza Maxcolchon', 'Maxcolchon').model).toBe(
      'Colchón Viscoelástico Gel Sport Alta Firmeza',
    );
    expect(parseShoppingTitle('Topper 4 Luxe Sobrecolchón 4cm Maxcolchon de Grosor Maxcolch', 'Maxcolchon').model).toBe(
      'Topper 4 Luxe Sobrecolchón 4cm de Grosor',
    );
    expect(parseShoppingTitle('Colchoneta de Espuma Viscoelástica Articulable Maxcolchón', 'Maxcolchon').model).toBe(
      'Colchoneta de Espuma Viscoelástica Articulable',
    );
    expect(parseShoppingTitle('Colchón Max Confort 90x190', 'Maxcolchon').model).toBe('Colchón Max Confort'); // "Max" no es la marca
    expect(parseShoppingTitle('Maxcolchon', 'Maxcolchon').model).toBe('Maxcolchon');
  });

  it('limpia los títulos de Flex: reclamos de oferta, separadores, "cm" suelto y medidas con cero delante', () => {
    expect(parseShoppingTitle('¡hasta 70% Dto! Canapé Abatible Madera 25 de Blanco 150x190', 'Flex')).toEqual({
      model: 'Canapé Abatible Madera 25 de Blanco',
      size: '150x190',
      extra: null,
    });
    expect(parseShoppingTitle('Canape Minimal Rustic Gris 090x200', 'Flex').size).toBe('90x200');
    expect(parseShoppingTitle('Canapé Abatible Living Eléctrico polipiel negro Cm 180x190', 'Flex').model).toBe(
      'Canapé Abatible Living Eléctrico polipiel negro',
    );
    expect(parseShoppingTitle('Colchón Imperial - 105x182 cm', 'Flex')).toMatchObject({ model: 'Colchón Imperial', size: '105x182' });
    expect(parseShoppingTitle('Canapé Abatible 19 - Blanco 150x190', 'Flex').model).toBe('Canapé Abatible 19 Blanco');
    expect(parseShoppingTitle('Flex Colchón Halia 25', 'Flex').model).toBe('Colchón Halia 25');
    expect(parseShoppingTitle('Almohada Visco Plata 70 cm', 'Flex').model).toBe('Almohada Visco Plata 70 cm'); // "70 cm" sí es dato
    expect(parseShoppingTitle('Base Tapizada Tapiflex Crudo', 'Flex').model).toBe('Base Tapizada Tapiflex Crudo'); // no es la marca
    expect(parseShoppingTitle('Colchón Flexible Confort -30% Black Friday', 'Flex').model).toBe('Colchón Flexible Confort');
    expect(parseShoppingTitle('Colchón 100% algodón', 'X').model).toBe('Colchón 100% algodón');
  });
});

describe('Google Shopping: agrupación por modelo', () => {
  const cfg = { seller: 'Maxcolchon ES', brand: 'Maxcolchon' };
  const items: ShoppingItem[] = [
    item('Maxcolchon Colchón Intense', 346.3, 433, {
      product_id: '160',
      product_images: ['https://img/intense.jpg'],
      product_rating: { value: 4.6, votes_count: 80, rating_max: 5 },
    }),
    item('Colchón Intense 90x190', 234.91, 294, { product_rating: { value: 4.7, votes_count: 54, rating_max: 5 } }),
    item('Colchón Intense 150x190', 353.54, 442),
    item('Colchón Intense 90x190', 240, 300), // repetido en otra búsqueda: manda el primero
    item('Maxcolchon Colchón Everest', 604.81, 756, { product_id: '723' }),
    item('Colchón de muelles 7 zonas', 299, null, { seller: 'Leroy Merlin España' }),
    { type: 'google_shopping_carousel', title: 'Menos de 300 €.' },
  ];

  it('una ficha por modelo, una variante por medida, con precio tachado', () => {
    const products = groupShoppingItems(items, cfg);
    expect(products.map((p) => p.title).sort()).toEqual(['Colchón Everest', 'Colchón Intense']);
    const intense = products.find((p) => p.title === 'Colchón Intense')!;
    expect(intense).toMatchObject({
      externalId: 'gshop:colchon-intense',
      vendor: 'Maxcolchon',
      imageUrl: 'https://img/intense.jpg',
      rating: 4.6,
      reviewCount: 80,
      raw: { source: 'google_shopping', googleProductId: '160' },
    });
    // Con medidas, el precio destacado sin medida no se guarda como variante
    expect(intense.variants).toEqual([
      expect.objectContaining({ externalId: '90x190', title: '90x190', price: 234.91, compareAtPrice: 294, available: null, options: { medida: '90x190' } }),
      expect.objectContaining({ externalId: '150x190', price: 353.54, compareAtPrice: 442 }),
    ]);
  });

  it('un modelo sin medidas guarda el precio destacado de Google', () => {
    const everest = groupShoppingItems(items, cfg).find((p) => p.title === 'Colchón Everest')!;
    expect(everest.variants).toEqual([expect.objectContaining({ externalId: 'google', title: null, price: 604.81, compareAtPrice: 756 })]);
  });

  it('ignora otros vendedores', () => {
    expect(groupShoppingItems(items, { seller: 'Otra tienda' })).toEqual([]);
  });
});

describe('Google Shopping: adaptador con DataForSEO simulado', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lanza las búsquedas de partida y una por modelo, y devuelve diagnóstico y margen de retirada', async () => {
    const posted: string[][] = [];
    const results: Record<string, ShoppingItem[]> = {
      maxcolchon: [item('Maxcolchon Colchón Intense', 346.3, 433), item('Colchón Visco 90x190', 128.59, 161)],
      'Maxcolchon Colchón Intense': [item('Colchón Intense 90x190', 234.91, 294), item('Colchón Intense 135x190', 329.82, 412)],
      'Maxcolchon Colchón Visco': [item('Colchón Visco 90x190', 128.59, 161), item('Colchón Visco 135x190', 160, 200)],
    };
    const keywordById = new Map<string, string>();
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.endsWith('/task_post')) {
        const body = JSON.parse(String(init!.body)) as { keyword: string }[];
        posted.push(body.map((b) => b.keyword));
        const tasks = body.map((b, i) => {
          const id = `${posted.length}-${i}`;
          keywordById.set(id, b.keyword);
          return { id, status_code: 20100, status_message: 'Task Created.', data: { keyword: b.keyword } };
        });
        return Response.json({ status_code: 20000, cost: 0.002 * body.length, tasks });
      }
      const id = url.split('/').pop()!;
      const kw = keywordById.get(id)!;
      return Response.json({
        status_code: 20000,
        tasks: [{ id, status_code: 20000, cost: 0, data: { keyword: kw }, result: [{ items: results[kw] ?? [] }] }],
      });
    });
    const res = await googleShoppingAdapter.scrape('https://www.maxcolchon.com', {
      maxProducts: 100,
      delayMs: 0,
      log: () => {},
      config: { seller: 'Maxcolchon ES', brand: 'Maxcolchon', queries: ['maxcolchon'], pollMs: 0 },
    });
    expect(posted).toEqual([['maxcolchon'], ['Maxcolchon Colchón Intense', 'Maxcolchon Colchón Visco']]);
    expect(res.platform).toBe('google_shopping');
    expect(res.removalGraceDays).toBe(3);
    expect(res.products.map((p) => [p.title, p.variants.map((v) => v.externalId)])).toEqual([
      ['Colchón Intense', ['90x190', '135x190']],
      ['Colchón Visco', ['90x190', '135x190']],
    ]);
    expect(res.diagnostics).toMatchObject({ queries: 3, failedQueries: 0, models: 2, variants: 4, costUsd: 0.006 });
    expect(res.error).toBeUndefined();
  });

  it('reintenta una vez las búsquedas que fallan', async () => {
    let posts = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('/task_post')) {
        posts++;
        return Response.json({ status_code: 20000, cost: 0.002, tasks: [{ id: `t${posts}`, status_code: 20100, data: { keyword: 'maxcolchon' } }] });
      }
      const id = url.split('/').pop()!;
      return id === 't1'
        ? Response.json({ status_code: 20000, tasks: [{ id, status_code: 50000, status_message: 'Internal SE Server Error.' }] })
        : Response.json({ status_code: 20000, tasks: [{ id, status_code: 20000, result: [{ items: [item('Colchón Visco 90x190', 128.59, 161)] }] }] });
    });
    const res = await googleShoppingAdapter.scrape('https://x.com', {
      maxProducts: 10, delayMs: 0, log: () => {},
      config: { seller: 'Maxcolchon ES', brand: 'Maxcolchon', queries: ['maxcolchon'], discoverModels: false, pollMs: 0 },
    });
    expect(posts).toBe(2);
    expect(res.products).toHaveLength(1);
    expect(res.warnings).toEqual([]);
    expect(res.diagnostics).toMatchObject({ failedQueries: 0 });
  });

  it('explica cuando el vendedor no aparece', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.endsWith('/task_post')
        ? Response.json({ status_code: 20000, cost: 0, tasks: [{ id: 'a', status_code: 20100, data: { keyword: 'x' } }] })
        : Response.json({ status_code: 20000, tasks: [{ id: 'a', status_code: 20000, result: [{ items: [item('Otro', 10, null, { seller: 'Otra' })] }] }] }),
    );
    const res = await googleShoppingAdapter.scrape('https://x.com', {
      maxProducts: 10, delayMs: 0, log: () => {}, config: { seller: 'Maxcolchon ES', queries: ['x'], pollMs: 0 },
    });
    expect(res.products).toEqual([]);
    expect(res.error).toMatch(/ningún resultado del vendedor «Maxcolchon ES»/);
  });
});
