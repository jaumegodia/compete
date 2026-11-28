/** Mercados europeos disponibles (país del proyecto: idioma de búsqueda y moneda en DataForSEO y Shopping). */
export const COUNTRIES: { code: string; es: string; en: string; currency: string }[] = [
  { code: 'ES', es: 'España', en: 'Spain', currency: 'EUR' },
  { code: 'PT', es: 'Portugal', en: 'Portugal', currency: 'EUR' },
  { code: 'FR', es: 'Francia', en: 'France', currency: 'EUR' },
  { code: 'IT', es: 'Italia', en: 'Italy', currency: 'EUR' },
  { code: 'DE', es: 'Alemania', en: 'Germany', currency: 'EUR' },
  { code: 'AT', es: 'Austria', en: 'Austria', currency: 'EUR' },
  { code: 'NL', es: 'Países Bajos', en: 'Netherlands', currency: 'EUR' },
  { code: 'BE', es: 'Bélgica', en: 'Belgium', currency: 'EUR' },
  { code: 'IE', es: 'Irlanda', en: 'Ireland', currency: 'EUR' },
  { code: 'GB', es: 'Reino Unido', en: 'United Kingdom', currency: 'GBP' },
  { code: 'CH', es: 'Suiza', en: 'Switzerland', currency: 'CHF' },
  { code: 'PL', es: 'Polonia', en: 'Poland', currency: 'PLN' },
  { code: 'SE', es: 'Suecia', en: 'Sweden', currency: 'SEK' },
  { code: 'DK', es: 'Dinamarca', en: 'Denmark', currency: 'DKK' },
  { code: 'FI', es: 'Finlandia', en: 'Finland', currency: 'EUR' },
  { code: 'NO', es: 'Noruega', en: 'Norway', currency: 'NOK' },
];

/** Sectores: ver lib/taxonomy.ts (cada uno con sus tipos de producto). */
export { VERTICALS } from './taxonomy';
