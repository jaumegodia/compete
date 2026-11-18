import { describe, expect, it } from 'vitest';
import { analyzeMessage, extractPromos } from '../src/promos.js';
import { promoChanged } from '../src/persist.js';

describe('analyzeMessage', () => {
  it('detecta descuento, "hasta", campaña y código', () => {
    const m = analyzeMessage('BLACK FRIDAY · Hasta -40% en colchones con el código BF40', 'promo-block')!;
    expect(m).toMatchObject({ discountPct: 40, upTo: true, codes: ['BF40'], campaigns: ['Black Friday'] });
  });
  it('no confunde financiación ni composición con descuentos', () => {
    const m = analyzeMessage('Paga en 12 meses al 0% TAE · Envío gratis', 'promo-block')!;
    expect(m).toMatchObject({ discountPct: null, financing: true, freeShipping: true });
    expect(analyzeMessage('Funda 100% algodón orgánico', 'hero')).toBeNull();
    expect(analyzeMessage('El 98% de nuestros clientes lo recomienda', 'hero')).toBeNull();
  });
  it('detecta importes y regalos', () => {
    expect(analyzeMessage('50€ de descuento en tu colchón', 'header')).toMatchObject({ amountOff: 50 });
    expect(analyzeMessage('Almohada de regalo con tu colchón', 'header')).toMatchObject({ gift: true });
  });
  it('ignora textos sin señales', () => {
    expect(analyzeMessage('Colchones', 'header')).toBeNull();
  });
});

describe('extractPromos', () => {
  it('lee la topbar y elige el mayor descuento de los bloques de promoción', () => {
    const html = `<html><body>
      <div class="announcement-bar"><p>Envío gratis en 48/72h</p><p>Black Friday: -30% en todo con el código BLACK30</p></div>
      <header><a href="/ofertas">Ofertas</a></header>
      <main><h1>Descansa como una marmota</h1><div class="product-card"><span class="badge">-50%</span></div></main>
      <script>var x = "Hasta 70% en outlet";</script>
    </body></html>`;
    const p = extractPromos(html, 'https://x.com/');
    expect(p.mainDiscountPct).toBe(30);
    expect(p.codes).toEqual(['BLACK30']);
    expect(p.campaigns).toContain('Black Friday');
    expect(p.freeShipping).toBe(true);
    // El badge de producto y el texto del script no cuentan si hay bloques de promoción con descuento
    expect(p.messages.some((m) => m.text.includes('70%'))).toBe(false);
  });
  it('si la topbar se pinta con JavaScript, busca el mensaje en los datos de la página', () => {
    const html = `<html><body><div id="root"></div>
      <script id="__NEXT_DATA__" type="application/json">{"props":{"topbar":{"text":"Hasta un 55% de descuento \\u00b7 Black Friday"}}}</script>
    </body></html>`;
    const p = extractPromos(html, 'https://x.com/');
    expect(p.mainDiscountPct).toBe(55);
    expect(p.upTo).toBe(true);
    expect(p.messages[0].source).toBe('script');
  });
  it('sin promociones devuelve un resumen vacío', () => {
    const p = extractPromos('<html><body><header><a>Colchones</a></header></body></html>', 'https://x.com/');
    expect(p).toMatchObject({ mainDiscountPct: null, codes: [], campaigns: [], freeShipping: false, messages: [] });
  });
});

describe('promoChanged', () => {
  const row = { main_discount_pct: '30.00', up_to: true, codes: ['A'], campaigns: ['Black Friday'], free_shipping: true };
  it('solo cambia si cambia el contenido de la promoción', () => {
    expect(promoChanged(null, { ...row })).toBe(false); // primera captura
    expect(promoChanged(row, { ...row, main_discount_pct: 30, codes: ['A'] })).toBe(false);
    expect(promoChanged(row, { ...row, main_discount_pct: 40 })).toBe(true);
    expect(promoChanged(row, { ...row, campaigns: [] })).toBe(true);
  });
});
