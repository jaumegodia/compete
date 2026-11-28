import { classifyByRules, typeLabel, typeOrder } from './taxonomy';

/**
 * Tipo de producto de un producto para el panel: el guardado en products.product_type (lo calcula
 * scrapers/src/classify.ts con reglas e IA) o, mientras no esté clasificado, las reglas del sector.
 * Devuelve la clave de web/lib/taxonomy.ts; la etiqueta se obtiene con typeLabel().
 */
export function productTypeOf(
  p: { product_type?: string | null; title: string; category?: string | null; url?: string | null },
  vertical: string | null | undefined,
): string {
  return p.product_type || classifyByRules(p, vertical ? [vertical] : []) || 'otros';
}

/** Claves de tipo presentes, en el orden del sector del proyecto. */
export function sortedTypes(keys: Iterable<string>, vertical: string | null | undefined): string[] {
  const order = typeOrder(vertical);
  return [...new Set(keys)].sort((a, b) => order(a) - order(b));
}

export { typeLabel };
