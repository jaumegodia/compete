import { describe, expect, it } from 'vitest';
import { parseTimestamp, parseTrustpilot } from '../src/reviews.js';

describe('Reseñas: fechas', () => {
  it('lee el formato de DataForSEO', () => {
    expect(parseTimestamp('2026-11-20 08:14:03 +00:00')).toBe('2026-11-20T08:14:03.000Z');
    expect(parseTimestamp('2026-11-20 10:14:03 +02:00')).toBe('2026-11-20T08:14:03.000Z');
    expect(parseTimestamp('2026-11-20 08:14:03')).toBe('2026-11-20T08:14:03.000Z');
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp(null)).toBeNull();
  });
});

describe('Reseñas: Trustpilot', () => {
  const result = {
    domain: 'emma-colchon.es',
    rating: { rating_type: 'Max5', value: 4.3, votes_count: 12873, rating_max: 5 },
    reviews_count: 12873,
    items: [
      {
        type: 'trustpilot_review_search',
        url: 'https://es.trustpilot.com/reviews/673d9f1e2b3c4d5e6f708192',
        rating: { rating_type: 'Max5', value: 5, rating_max: 5 },
        title: 'Muy cómodo',
        review_text: 'Llegó en dos días.',
        language: 'es',
        timestamp: '2026-11-20 08:14:03 +00:00',
        user_profile: { name: 'Laura' },
        responses: [{ text: 'Gracias Laura' }],
      },
      {
        type: 'trustpilot_review_search',
        rating: { value: 1 },
        review_text: 'Nunca llegó el pedido',
        timestamp: '2026-11-18 19:00:00 +00:00',
        user_profile: { name: 'Pere' },
        responses: [],
      },
      { type: 'trustpilot_review_search', rating: { value: 3 } }, // sin texto: se descarta
    ],
  };

  it('nota global, recuento y reseñas', () => {
    const tp = parseTrustpilot(result, 'emma-colchon.es');
    expect(tp.rating).toBe(4.3);
    expect(tp.reviews_count).toBe(12873);
    expect(tp.profile_url).toBe('https://es.trustpilot.com/review/emma-colchon.es');
    expect(tp.reviews).toHaveLength(2);
    expect(tp.reviews[0]).toMatchObject({
      review_id: '673d9f1e2b3c4d5e6f708192',
      rating: 5,
      title: 'Muy cómodo',
      author: 'Laura',
      replied: true,
      published_at: '2026-11-20T08:14:03.000Z',
    });
    expect(tp.reviews[1]).toMatchObject({ rating: 1, replied: false, title: null });
  });

  it('id estable sin URL', () => {
    const a = parseTrustpilot(result, 'x.es').reviews[1].review_id;
    const b = parseTrustpilot(result, 'x.es').reviews[1].review_id;
    expect(a).toBe(b);
    expect(a).toHaveLength(24);
  });

  it('tolera resultado vacío', () => {
    expect(parseTrustpilot(null, 'x.es')).toMatchObject({ rating: null, reviews_count: null, reviews: [] });
  });
});
