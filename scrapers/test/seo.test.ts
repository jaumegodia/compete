import { describe, expect, it } from 'vitest';
import { domainOf, parseHistory, parseRankedKeywords } from '../src/seo.js';

describe('SEO: dominio', () => {
  it('quita protocolo, www y barra final', () => {
    expect(domainOf('https://www.maxcolchon.com/')).toBe('maxcolchon.com');
    expect(domainOf('https://comounamarmota.com')).toBe('comounamarmota.com');
    expect(domainOf('https://www.emma-colchon.es')).toBe('emma-colchon.es');
  });
});

describe('SEO: historical_rank_overview', () => {
  const items = [
    {
      se_type: 'google',
      year: 2026,
      month: 10,
      metrics: {
        organic: {
          pos_1: 120, pos_2_3: 300, pos_4_10: 900, pos_11_20: 1000, pos_21_30: 800, pos_31_40: 500,
          pos_41_50: 400, pos_51_60: 300, pos_61_70: 200, pos_71_80: 100, pos_81_90: 100, pos_91_100: 80,
          etv: 45210.7, count: 4800, estimated_paid_traffic_cost: 30120.5, is_new: 410, is_up: 900, is_down: 700, is_lost: 350,
        },
        paid: { pos_1: 10, etv: 1500.2, count: 85, estimated_paid_traffic_cost: 2100 },
      },
    },
    { se_type: 'google', year: 2026, month: 9, metrics: { organic: { etv: 40000, count: 4500 } } },
    { se_type: 'google', year: null, month: null },
  ];

  it('una fila por mes, ordenada, con posiciones agregadas', () => {
    const rows = parseHistory(items);
    expect(rows.map((r) => r.month)).toEqual(['2026-09-01', '2026-10-01']);
    const oct = rows[1];
    expect(oct.organic_etv).toBe(45210.7);
    expect(oct.organic_keywords).toBe(4800);
    expect(oct.organic_pos_1).toBe(120);
    expect(oct.organic_pos_11_100).toBe(3480);
    expect(oct.organic_new).toBe(410);
    expect(oct.organic_lost).toBe(350);
    expect(oct.paid_etv).toBe(1500.2);
    expect(oct.paid_keywords).toBe(85);
    expect(oct.paid_traffic_cost).toBe(2100);
    expect(rows[0].paid_etv).toBeNull();
  });

  it('tolera respuestas vacías', () => {
    expect(parseHistory(undefined as never)).toEqual([]);
  });
});

describe('SEO: ranked_keywords', () => {
  const kw = (keyword: string, pos: number, etv: number, volume = 1000) => ({
    se_type: 'google',
    keyword_data: { keyword, keyword_info: { search_volume: volume, cpc: 1.2 } },
    ranked_serp_element: { serp_item: { type: 'organic', rank_group: pos, rank_absolute: pos + 1, etv, url: `https://x.com/${pos}` } },
  });

  it('ordena por tráfico y elimina duplicados', () => {
    const rows = parseRankedKeywords([kw('colchon', 5, 300), kw('colchon viscoelastico', 1, 900), kw('colchon', 3, 500), { keyword_data: {} }]);
    expect(rows.map((r) => r.keyword)).toEqual(['colchon viscoelastico', 'colchon']);
    expect(rows[1]).toMatchObject({ position: 3, etv: 500, search_volume: 1000, cpc: 1.2, url: 'https://x.com/3' });
  });
});
