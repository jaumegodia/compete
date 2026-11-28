import { describe, expect, it } from 'vitest';
import { candidateTypes, classifyByRules, typeLabel, TYPES, VERTICALS } from '../../web/lib/taxonomy.js';

const cls = (title: string, vertical: string, category: string | null = null, url: string | null = null) =>
  classifyByRules({ title, category, url }, [vertical]);

describe('taxonomía', () => {
  it('todos los tipos de los sectores existen y las reglas apuntan a tipos del sector o comunes', () => {
    const keys = new Set(TYPES.map((t) => t.key));
    for (const v of VERTICALS) {
      for (const t of v.types) expect(keys.has(t), `${v.id}: ${t}`).toBe(true);
      for (const [, t] of v.rules) expect(keys.has(t), `${v.id}: regla → ${t}`).toBe(true);
    }
  });

  it('candidatos: los del sector más los comunes; sin sector, todos', () => {
    const c = candidateTypes(['moda']);
    expect(c).toContain('vaqueros');
    expect(c).not.toContain('colchones');
    expect(c.slice(-3)).toEqual(['packs', 'tarjetas-regalo', 'otros']);
    expect(candidateTypes([]).length).toBe(TYPES.length);
  });

  it('descanso (títulos reales)', () => {
    expect(cls('Colchón Zz4 Medium Airvex', 'descanso')).toBe('colchones');
    expect(cls('EL MARMOTA HYBRID', 'descanso')).toBe('colchones');
    expect(cls('Abatible Polipiel /Tapa 3d', 'descanso')).toBe('canapes');
    expect(cls('Alm. Visco Fresh Cool', 'descanso')).toBe('almohadas');
    expect(cls('Pack Colchón + Almohada', 'descanso')).toBe('packs');
    expect(cls('Colchón Nube Junior cama nido', 'descanso')).toBe('colchones-infantiles');
  });

  it('hogar (títulos reales de Sklum y Pummba)', () => {
    expect(cls('Lámpara de mesa solar LED inalámbrica para exterior Barus', 'hogar')).toBe('iluminacion');
    expect(cls('Pack de 4 sillas de jardín apilables en polipropileno Wendell', 'hogar')).toBe('sillas');
    expect(cls('Pack de 2 tiradores en resina Awel', 'hogar', 'Tiradores y pomos')).not.toBe('packs');
    expect(cls('Pummba I - 3 plazas con 1 Brazo Estrecho y 2 Minipuffs', 'hogar')).toBe('sofas');
    expect(cls('Pummba II - Fundas Bouclé Sillón', 'hogar')).toBe('sillones');
    expect(cls('Mesita de noche flotante 40x30 cm con cajón Griviza', 'hogar')).toBe('mesas-auxiliares');
    expect(cls('Escritorio 140x60 cm en madera de mango Anecy', 'hogar')).toBe('mesas');
    expect(cls('Pie de sombrilla redondo Ø30 cm en cemento Okeke', 'hogar', 'Pies de sombrilla')).toBe('jardin');
    expect(cls('Toallero de pie en bambú Heyki', 'hogar')).toBe('bano');
  });

  it('moda, belleza y electrónica', () => {
    expect(cls('Zapatillas de piel blancas', 'moda')).toBe('calzado');
    expect(cls('Jeans slim fit azul', 'moda')).toBe('vaqueros');
    expect(cls('Chaqueta de punto de lana', 'moda')).toBe('abrigos');
    expect(cls('Sérum facial con retinol 30 ml', 'belleza')).toBe('facial');
    expect(cls('Protector solar SPF 50', 'belleza')).toBe('solares');
    expect(cls('Funda de silicona para iPhone 15', 'electronica')).toBe('accesorios-electronica');
    expect(cls('Auriculares inalámbricos con cancelación de ruido', 'electronica')).toBe('audio');
  });

  it('usa la categoría de la tienda y la URL si el título no basta', () => {
    expect(cls('Modelo Aurora', 'moda', 'Vestidos')).toBe('vestidos');
    expect(cls('Modelo Aurora', 'moda', null, 'https://tienda.com/es/vestidos/aurora-123')).toBe('vestidos');
    expect(cls('Modelo Aurora', 'moda')).toBeNull();
  });

  it('tarjetas regalo en cualquier sector y etiquetas', () => {
    expect(cls('Tarjeta regalo 50 €', 'moda')).toBe('tarjetas-regalo');
    expect(typeLabel('sofas')).toBe('Sofás');
    expect(typeLabel('sofas', 'en')).toBe('Sofas');
    expect(typeLabel(null)).toBe('Sin clasificar');
  });
});
