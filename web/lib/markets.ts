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

/**
 * Sectores sugeridos. Es texto libre: el sector solo orienta la clasificación de productos y la comparativa;
 * cualquier tienda se captura igual.
 */
export const VERTICALS: { id: string; es: string; en: string }[] = [
  { id: 'descanso', es: 'Descanso (colchones, almohadas…)', en: 'Sleep (mattresses, pillows…)' },
  { id: 'moda', es: 'Moda y calzado', en: 'Fashion & footwear' },
  { id: 'belleza', es: 'Belleza y cosmética', en: 'Beauty & cosmetics' },
  { id: 'hogar', es: 'Hogar y decoración', en: 'Home & decor' },
  { id: 'electronica', es: 'Electrónica', en: 'Electronics' },
  { id: 'deporte', es: 'Deporte', en: 'Sports' },
  { id: 'alimentacion', es: 'Alimentación y bebidas', en: 'Food & drinks' },
  { id: 'mascotas', es: 'Mascotas', en: 'Pets' },
  { id: 'infantil', es: 'Bebé e infantil', en: 'Baby & kids' },
  { id: 'salud', es: 'Salud y bienestar', en: 'Health & wellness' },
  { id: 'otro', es: 'Otro', en: 'Other' },
];
