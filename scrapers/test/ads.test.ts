import { describe, expect, it } from 'vitest';
import { ownAdvertisers, parseAds, summarizeAds } from '../src/ads.js';

const NOW = new Date('2026-11-23T12:00:00Z').getTime();
const ad = (creative_id: string, advertiser_id: string, title: string, format: string, first: string, last: string) => ({
  type: 'ads_search',
  advertiser_id,
  creative_id,
  title,
  url: `https://adstransparency.google.com/advertiser/${advertiser_id}/creative/${creative_id}?region=ES`,
  verified: true,
  format,
  preview_url: null,
  first_shown: first,
  last_shown: last,
});

const items = [
  ad('CR1', 'AR_EMMA', 'Emma Matratzen GmbH', 'text', '2026-11-20 10:00:00 +00:00', '2026-11-22 08:00:00 +00:00'), // activo y nuevo
  ad('CR2', 'AR_EMMA', 'Emma Matratzen GmbH', 'video', '2026-03-01 10:00:00 +00:00', '2026-11-21 08:00:00 +00:00'), // activo
  ad('CR3', 'AR_EMMA', 'Emma Matratzen GmbH', 'image', '2025-01-01 10:00:00 +00:00', '2026-10-01 08:00:00 +00:00'), // inactivo
  ad('CR4', 'AR_HK', 'HONGKONG ADFLY LIMITED', 'image', '2026-11-19 10:00:00 +00:00', '2026-11-23 08:00:00 +00:00'), // tercero activo
  ad('CR1', 'AR_EMMA', 'Emma Matratzen GmbH', 'text', '2026-11-20 10:00:00 +00:00', '2026-11-22 08:00:00 +00:00'), // duplicado
  { type: 'ads_search' }, // sin creative_id
];

describe('Publicidad: Google Ads Transparency', () => {
  it('parsea anuncios sin duplicados', () => {
    const ads = parseAds(items);
    expect(ads).toHaveLength(4);
    expect(ads[0]).toMatchObject({ creative_id: 'CR1', advertiser_name: 'Emma Matratzen GmbH', format: 'text', first_shown: '2026-11-20T10:00:00.000Z' });
  });

  it('el anunciante propio es el que más anuncios tiene, salvo que se configure', () => {
    const ads = parseAds(items);
    expect([...ownAdvertisers(ads, null)]).toEqual(['AR_EMMA']);
    expect([...ownAdvertisers(ads, ['AR_X', 'AR_Y'])]).toEqual(['AR_X', 'AR_Y']);
  });

  it('resume solo los propios y cuenta aparte los terceros', () => {
    const ads = parseAds(items);
    const s = summarizeAds(ads, ownAdvertisers(ads, null), NOW);
    expect(s).toMatchObject({
      ads_total: 3,
      ads_active: 2,
      ads_new_7d: 1,
      by_format: { text: 1, video: 1 },
      advertisers: [{ id: 'AR_EMMA', name: 'Emma Matratzen GmbH' }],
      third_party_active: 1,
      third_party: [{ id: 'AR_HK', name: 'HONGKONG ADFLY LIMITED', active: 1 }],
    });
  });
});
