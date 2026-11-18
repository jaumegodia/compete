/**
 * Tipo de producto común a todas las marcas. Cada tienda publica categorías distintas
 * (Marmota pone "Marmota" a todo, Emma mete protectores en "Complementos"…), así que se deduce
 * del título y, si el título no basta, de la categoría de la tienda.
 */
export const PRODUCT_TYPES = [
  'Colchones',
  'Colchones infantiles y nido',
  'Toppers',
  'Almohadas',
  'Protectores y fundas de colchón',
  'Edredones y ropa de cama',
  'Canapés',
  'Bases y somieres',
  'Camas y cabeceros',
  'Sofás y sillones',
  'Muebles',
  'Packs',
  'Otros',
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// El orden importa: la primera regla que encaja gana ("Sofá cama" es sofá, "Colchón cama nido" es colchón…).
const RULES: [RegExp, ProductType][] = [
  [/\bpacks?\b/, 'Packs'],
  [/tarjeta regalo|tarjeta de regalo|gift card/, 'Otros'],
  [/\bsofas?\b|\bsillon|\bpuff\b/, 'Sofás y sillones'],
  [/\btoppers?\b/, 'Toppers'],
  [/funda[s]? (de )?almohada|\bedredon|\bnordico|\bsabanas?\b|ropa de cama/, 'Edredones y ropa de cama'],
  [/\bprotector|\bfundas? (de )?(algodon|colchon)|fundas de colchon/, 'Protectores y fundas de colchón'],
  [/\balmohada/, 'Almohadas'],
  [/\bcuna\b|colchon.*\b(infantil|cama nido)|\bsupletorio/, 'Colchones infantiles y nido'],
  [/\bcolchon/, 'Colchones'],
  [/\bcanape/, 'Canapés'],
  [/\bbases?\b|tapibase|\bsomier/, 'Bases y somieres'],
  [/\bcamas?\b|\blitera|\bcabecero/, 'Camas y cabeceros'],
  [/\bmesita|\bmesilla|\bcomoda\b/, 'Muebles'],
  // Colchones de Marmota, que no llevan la palabra "colchón" en el nombre
  [/^el marmota( hybrid)?$|^marmota visco|^el hybrid\b/, 'Colchones'],
];

export function productType(title: string, shopCategory?: string | null): ProductType {
  const t = norm(title).replace(/\s+/g, ' ').trim();
  for (const [re, type] of RULES) if (re.test(t)) return type;
  if (shopCategory) {
    const c = norm(shopCategory);
    for (const [re, type] of RULES) if (re.test(c)) return type;
  }
  return 'Otros';
}
