/**
 * Taxonomía de tipos de producto por sector. La comparten el panel (etiquetas, orden) y los scrapers
 * (clasificación). Cada producto se clasifica una vez y se guarda la clave en products.product_type:
 *   1. reglas rápidas (expresiones regulares sobre título, categoría de la tienda y URL);
 *   2. lo que no encaja, con IA (scrapers/src/classify.ts), eligiendo solo entre estas claves;
 *   3. si no hay IA, 'otros'.
 *
 * Un tipo puede estar en varios sectores (un colchón es un colchón en «descanso» y en «hogar»).
 * Para añadir un sector: una entrada en VERTICALS con sus tipos y, si se quiere, reglas.
 * Este archivo no importa nada: se usa desde Next.js y desde Node.
 */

export interface ProductTypeDef {
  key: string;
  es: string;
  en: string;
}

export interface VerticalDef {
  id: string;
  es: string;
  en: string;
  /** Tipos del sector, en el orden en que se muestran. */
  types: string[];
  /** Reglas en orden: la primera que encaja gana. Se aplican al texto sin acentos y en minúsculas. */
  rules: [RegExp, string][];
  /** La comparativa por medida (90x190…) tiene sentido en este sector. */
  bySize?: boolean;
}

const T = (key: string, es: string, en: string): ProductTypeDef => ({ key, es, en });

export const TYPES: ProductTypeDef[] = [
  // Descanso
  T('colchones', 'Colchones', 'Mattresses'),
  T('colchones-infantiles', 'Colchones infantiles y nido', 'Kids and trundle mattresses'),
  T('toppers', 'Toppers', 'Toppers'),
  T('almohadas', 'Almohadas', 'Pillows'),
  T('protectores', 'Protectores y fundas de colchón', 'Mattress protectors'),
  T('ropa-cama', 'Edredones y ropa de cama', 'Duvets and bedding'),
  T('canapes', 'Canapés', 'Storage beds'),
  T('bases-somieres', 'Bases y somieres', 'Bed bases'),
  T('camas-cabeceros', 'Camas y cabeceros', 'Beds and headboards'),
  // Hogar
  T('sofas', 'Sofás', 'Sofas'),
  T('sillones', 'Sillones y butacas', 'Armchairs'),
  T('sillas', 'Sillas y taburetes', 'Chairs and stools'),
  T('mesas', 'Mesas', 'Tables'),
  T('mesas-auxiliares', 'Mesas auxiliares y mesitas', 'Side and bedside tables'),
  T('almacenaje', 'Armarios, cómodas y almacenaje', 'Wardrobes and storage'),
  T('estanterias', 'Estanterías y muebles TV', 'Shelving and TV units'),
  T('iluminacion', 'Iluminación', 'Lighting'),
  T('alfombras', 'Alfombras', 'Rugs'),
  T('textil-hogar', 'Cojines, cortinas y textil', 'Cushions, curtains and textiles'),
  T('decoracion', 'Decoración', 'Decor'),
  T('espejos', 'Espejos', 'Mirrors'),
  T('cocina-menaje', 'Cocina y menaje', 'Kitchen and tableware'),
  T('bano', 'Baño', 'Bathroom'),
  T('jardin', 'Jardín y exterior', 'Garden and outdoor'),
  // Moda
  T('camisetas', 'Camisetas y tops', 'T-shirts and tops'),
  T('camisas', 'Camisas y blusas', 'Shirts and blouses'),
  T('punto-sudaderas', 'Jerséis y sudaderas', 'Knitwear and sweatshirts'),
  T('abrigos', 'Abrigos y chaquetas', 'Coats and jackets'),
  T('vestidos', 'Vestidos y monos', 'Dresses and jumpsuits'),
  T('faldas', 'Faldas', 'Skirts'),
  T('pantalones', 'Pantalones', 'Trousers'),
  T('vaqueros', 'Vaqueros', 'Jeans'),
  T('ropa-interior', 'Ropa interior y pijamas', 'Underwear and nightwear'),
  T('bano-moda', 'Baño (bañadores, bikinis)', 'Swimwear'),
  T('calzado', 'Calzado', 'Footwear'),
  T('bolsos', 'Bolsos y mochilas', 'Bags and backpacks'),
  T('accesorios-moda', 'Accesorios (cinturones, gorros, gafas…)', 'Accessories'),
  T('joyeria', 'Joyería y relojes', 'Jewellery and watches'),
  // Belleza
  T('facial', 'Cuidado facial', 'Skincare'),
  T('corporal', 'Cuidado corporal', 'Body care'),
  T('maquillaje', 'Maquillaje', 'Make-up'),
  T('perfumes', 'Perfumes', 'Fragrances'),
  T('cabello', 'Cuidado del cabello', 'Hair care'),
  T('solares', 'Solares', 'Sun care'),
  T('higiene', 'Higiene', 'Hygiene'),
  T('utensilios-belleza', 'Utensilios y aparatos de belleza', 'Beauty tools and devices'),
  // Electrónica
  T('moviles', 'Móviles', 'Phones'),
  T('ordenadores', 'Ordenadores', 'Computers'),
  T('tablets', 'Tablets y e-readers', 'Tablets and e-readers'),
  T('tv', 'TV y vídeo', 'TV and video'),
  T('audio', 'Audio (auriculares, altavoces)', 'Audio'),
  T('fotografia', 'Fotografía', 'Cameras'),
  T('gaming', 'Consolas y videojuegos', 'Gaming'),
  T('electrodomesticos', 'Electrodomésticos', 'Appliances'),
  T('wearables', 'Relojes inteligentes y wearables', 'Smartwatches and wearables'),
  T('smart-home', 'Hogar inteligente', 'Smart home'),
  T('accesorios-electronica', 'Accesorios y cables', 'Accessories and cables'),
  // Deporte
  T('ropa-deportiva', 'Ropa deportiva', 'Sportswear'),
  T('calzado-deportivo', 'Calzado deportivo', 'Sports shoes'),
  T('fitness', 'Fitness y gimnasio', 'Fitness'),
  T('ciclismo', 'Ciclismo', 'Cycling'),
  T('outdoor', 'Montaña y outdoor', 'Outdoor'),
  T('deportes-agua', 'Deportes de agua', 'Water sports'),
  T('raqueta', 'Pádel, tenis y raqueta', 'Racket sports'),
  T('nutricion-deportiva', 'Nutrición deportiva', 'Sports nutrition'),
  // Alimentación
  T('alimentacion', 'Alimentación', 'Food'),
  T('bebidas', 'Bebidas', 'Drinks'),
  T('vinos-licores', 'Vinos y licores', 'Wine and spirits'),
  T('cafe-te', 'Café e infusiones', 'Coffee and tea'),
  T('dulces-snacks', 'Dulces y snacks', 'Sweets and snacks'),
  // Mascotas
  T('comida-perro', 'Comida para perros', 'Dog food'),
  T('comida-gato', 'Comida para gatos', 'Cat food'),
  T('accesorios-mascotas', 'Accesorios para mascotas', 'Pet accessories'),
  T('higiene-mascotas', 'Higiene y salud de mascotas', 'Pet care'),
  // Bebé e infantil
  T('carritos-sillas', 'Carritos y sillas de coche', 'Strollers and car seats'),
  T('mobiliario-infantil', 'Mobiliario infantil', 'Kids furniture'),
  T('ropa-infantil', 'Ropa infantil', 'Kids clothing'),
  T('juguetes', 'Juguetes', 'Toys'),
  T('cuidado-bebe', 'Higiene y alimentación del bebé', 'Baby care and feeding'),
  // Salud
  T('suplementos', 'Suplementos y vitaminas', 'Supplements'),
  T('parafarmacia', 'Parafarmacia', 'Pharmacy'),
  T('ortopedia', 'Ortopedia y bienestar', 'Orthopaedics and wellbeing'),
  // Comunes
  T('packs', 'Packs', 'Bundles'),
  T('tarjetas-regalo', 'Tarjetas regalo', 'Gift cards'),
  T('otros', 'Otros', 'Other'),
];

const COMMON: [RegExp, string][] = [
  [/tarjeta regalo|tarjeta de regalo|gift ?card|cheque regalo|bon cadeau|gutschein/, 'tarjetas-regalo'],
];

export const VERTICALS: VerticalDef[] = [
  {
    id: 'descanso',
    es: 'Descanso (colchones, almohadas…)',
    en: 'Sleep (mattresses, pillows…)',
    bySize: true,
    types: ['colchones', 'colchones-infantiles', 'toppers', 'almohadas', 'protectores', 'ropa-cama', 'canapes', 'bases-somieres', 'camas-cabeceros', 'sofas', 'mesas-auxiliares', 'packs'],
    rules: [
      [/\bpacks?\b/, 'packs'],
      [/\bsofas?\b|\bsillon|\bpuff\b/, 'sofas'],
      [/\btoppers?\b/, 'toppers'],
      [/funda[s]? (de )?almohada|\bedredon|\bnordico|\bsabanas?\b|ropa de cama/, 'ropa-cama'],
      [/\bprotector|\bfundas? (de )?(algodon|colchon)|fundas de colchon/, 'protectores'],
      [/\balmohada|^alm\. /, 'almohadas'],
      [/\bcuna\b|colchon.*\b(infantil|cama nido)|\bsupletorio/, 'colchones-infantiles'],
      [/\bcolchon/, 'colchones'],
      [/\bcanape|^abatible\b/, 'canapes'],
      [/\bbases?\b|tapibase|\bsomier/, 'bases-somieres'],
      [/\bcamas?\b|\blitera|\bcabecero/, 'camas-cabeceros'],
      [/\bmesita|\bmesilla|\bcomoda\b/, 'mesas-auxiliares'],
      // Colchones de Marmota, que no llevan la palabra "colchón" en el nombre
      [/^el marmota( hybrid)?$|^marmota visco|^el hybrid\b/, 'colchones'],
    ],
  },
  {
    id: 'hogar',
    es: 'Hogar y decoración',
    en: 'Home & decor',
    types: ['sofas', 'sillones', 'sillas', 'mesas', 'mesas-auxiliares', 'camas-cabeceros', 'colchones', 'almacenaje', 'estanterias', 'iluminacion', 'alfombras', 'textil-hogar', 'ropa-cama', 'decoracion', 'espejos', 'cocina-menaje', 'bano', 'jardin', 'packs'],
    rules: [
      [/\blamparas?\b|\bapliques?\b|\bflexos?\b|\bplafon|\bbombillas?\b|\bguirnaldas? (de )?luz|\bluminarias?\b|\bfocos?\b/, 'iluminacion'],
      [/\bsillas?\b|\btaburetes?\b|\bbanquetas?\b/, 'sillas'],
      [/\bpacks?\b/, 'packs'],
      [/\bsofas?\b|\bchaise ?longue|\bmodulos?\b|\bsofa cama|\brinconera|\bminipuff|\b\d plazas\b|\bbrazos? (ancho|estrecho)|\bfundas?\b.*\b(plazas|brazo|cojin|respaldo)\b|\bcojin (de )?(respaldo|rinconera|asiento)/, 'sofas'],
      [/\bsillon|\bbutacas?\b|\bpuffs?\b|\bmecedora/, 'sillones'],
      [/\bmesitas?\b|\bmesillas?\b|mesa (auxiliar|de centro|de noche|baja)|\bconsolas?\b/, 'mesas-auxiliares'],
      [/\bmesas?\b|\bescritorios?\b/, 'mesas'],
      [/\bcolchon/, 'colchones'],
      [/\bcamas?\b|\bcabeceros?\b|\bliteras?\b|\bcanape/, 'camas-cabeceros'],
      [/\barmarios?\b|\bcomodas?\b|\baparadores?\b|\bzapateros?\b|\bcajoneras?\b|\bvitrinas?\b|\bbaul|\bcajas?\b|\borganizador/, 'almacenaje'],
      [/\bestanterias?\b|\blibrerias?\b|\bbaldas?\b|mueble (de )?tv|\bestantes?\b/, 'estanterias'],
      [/\balfombras?\b|\bfelpudos?\b/, 'alfombras'],
      [/\bespejos?\b/, 'espejos'],
      [/jardin|\bexterior|terraza|\btumbonas?\b|\bhamacas?\b|\bparasol|\bsombrillas?\b|\bbarbacoa|\bmaceteros?\b|\bsalon(es)? de/, 'jardin'],
      [/\bedredon|\bnordicos?\b|\bsabanas?\b|ropa de cama|\bcolchas?\b|\bfundas? nordic/, 'ropa-cama'],
      [/\bcojines?\b|\bcortinas?\b|\bmantas?\b|\bplaids?\b|\bfundas? (de )?(cojin|sofa)|\bmanteles?\b|\bvisillos?\b/, 'textil-hogar'],
      [/\bvajillas?\b|\bplatos?\b|\bvasos?\b|\btazas?\b|\bcubiertos?\b|\bsartenes?\b|\bollas?\b|\bjarras?\b|\baceitera|\bcocina\b|\bbandejas?\b|\bcopas?\b|\bsalvamantel|\bposavasos/, 'cocina-menaje'],
      [/\bbano\b|\bducha\b|\btoallas?\b|\btoalleros?\b|\bjaboneras?\b|\bmampara|\bcestos? (para|de) (la )?ropa/, 'bano'],
      [/\bjarron|\bcuadros?\b|\blaminas?\b|\bvelas?\b|\bportavelas|\bfigura|\bdecoraci|\bplantas? artificial|\bcest[ao]s?\b|\bperchero|\brelojes? de pared|\bmarcos?\b|\bguirnaldas?\b|\badornos?\b|\bnavidad|\bsujetalibros|\bramos?\b|\bflores|\bescaleras? decorativ|\bjarrones?\b/, 'decoracion'],
    ],
  },
  {
    id: 'moda',
    es: 'Moda y calzado',
    en: 'Fashion & footwear',
    types: ['camisetas', 'camisas', 'punto-sudaderas', 'abrigos', 'vestidos', 'faldas', 'pantalones', 'vaqueros', 'ropa-interior', 'bano-moda', 'calzado', 'bolsos', 'accesorios-moda', 'joyeria', 'packs'],
    rules: [
      [/\bvaqueros?\b|\bjeans?\b|\bdenim\b/, 'vaqueros'],
      [/\bzapatos?\b|\bzapatillas?\b|\bsneakers?\b|\bbotas?\b|\bbotines?\b|\bsandalias?\b|\bmocasines?\b|\balpargatas?\b|\bchanclas?\b|\btacones?\b|\bbailarinas?\b/, 'calzado'],
      [/\bbolsos?\b|\bmochilas?\b|\bcarteras?\b|\bbandoleras?\b|\bmaletas?\b|\brinoneras?\b|\btote\b/, 'bolsos'],
      [/\bbikinis?\b|\bbanadores?\b|\bswim/, 'bano-moda'],
      [/\bsujetador|\bbragas?\b|\bcalzoncillos?\b|\bboxers?\b|\bcalcetines?\b|\bpijamas?\b|\bmedias\b|\blenceria|\bbodys?\b|\bslips?\b/, 'ropa-interior'],
      [/\bvestidos?\b|\bmonos?\b|\bpeto\b|\bjumpsuit/, 'vestidos'],
      [/\bfaldas?\b/, 'faldas'],
      [/\babrigos?\b|\bchaquetas?\b|\bcazadoras?\b|\bparkas?\b|\bplumiferos?\b|\bgabardinas?\b|\bblazers?\b|\bchalecos?\b|\btrench\b|\banorak/, 'abrigos'],
      [/\bjerseis?\b|\bjersey\b|\bsudaderas?\b|\bcardigans?\b|\bchaqueta de punto|\bhoodie|\bpolar\b/, 'punto-sudaderas'],
      [/\bcamisas?\b|\bblusas?\b|\bsobrecamisa/, 'camisas'],
      [/\bcamisetas?\b|\btops?\b|\bpolos?\b|\bt-?shirts?\b|\btirantes\b/, 'camisetas'],
      [/\bpantalon|\bshorts?\b|\bbermudas?\b|\bleggings?\b|\bchinos?\b|\bjoggers?\b/, 'pantalones'],
      [/\bcollares?\b|\bpendientes?\b|\banillos?\b|\bpulseras?\b|\brelojes?\b|\bjoyas?\b/, 'joyeria'],
      [/\bcinturon|\bgorras?\b|\bgorros?\b|\bbufandas?\b|\bgafas\b|\bsombreros?\b|\bpanuelos?\b|\bguantes\b|\bfoulard/, 'accesorios-moda'],
    ],
  },
  {
    id: 'belleza',
    es: 'Belleza y cosmética',
    en: 'Beauty & cosmetics',
    types: ['facial', 'corporal', 'maquillaje', 'perfumes', 'cabello', 'solares', 'higiene', 'utensilios-belleza', 'packs'],
    rules: [
      [/\bpacks?\b|\bset\b|\bkit\b|\brutina\b/, 'packs'],
      [/\bsolar\b|\bspf\b|protector solar|\bafter ?sun|\bautobronceador/, 'solares'],
      [/\bperfume|\beau de (parfum|toilette)|\bcolonia\b|\bfragancia/, 'perfumes'],
      [/\bchampu|\bacondicionador|\bmascarilla capilar|\bcabello|\bpelo\b|\bcapilar/, 'cabello'],
      [/\bbase de maquillaje|\bcorrector\b|\bmascara de pestanas|\brimel|\blabial|\bbarra de labios|\bsombra|\bcolorete|\bpolvos\b|\bdelineador|\bgloss\b|\bmaquillaje/, 'maquillaje'],
      [/\bserum\b|\bcontorno de ojos|\bcrema facial|\blimpiador facial|\btonico\b|\bfacial\b|\bantiedad|\bretinol|\bhialuronico/, 'facial'],
      [/\bcorporal\b|\bbody\b|\bexfoliante corporal|\baceite corporal|\bcrema de manos|\bmanos\b/, 'corporal'],
      [/\bdesodorante|\bgel de (ducha|bano)|\bjabon|\bdental|\bpasta de dientes|\bintima/, 'higiene'],
      [/\bbrochas?\b|\bpinceles?\b|\bsecador|\bplancha de pelo|\bcepillo|\besponja|\brizador/, 'utensilios-belleza'],
    ],
  },
  {
    id: 'electronica',
    es: 'Electrónica',
    en: 'Electronics',
    types: ['moviles', 'ordenadores', 'tablets', 'tv', 'audio', 'fotografia', 'gaming', 'electrodomesticos', 'wearables', 'smart-home', 'accesorios-electronica', 'packs'],
    rules: [
      [/\bfundas?\b|\bcargador|\bcables?\b|\bprotector de pantalla|\badaptador|\bpower ?bank|\bbateria externa|\bsoporte\b/, 'accesorios-electronica'],
      [/\bsmartwatch|\breloj inteligente|\bpulsera (de actividad|inteligente)|\bwatch\b/, 'wearables'],
      [/\bmovil|\bsmartphone|\biphone\b|\bgalaxy [sazm]\d/, 'moviles'],
      [/\btablet|\bipad\b|\be-?reader|\bkindle\b/, 'tablets'],
      [/\bportatil|\bordenador|\blaptop|\bmacbook|\bimac\b|\bpc\b|\bmonitor/, 'ordenadores'],
      [/\btelevisor|\b(smart )?tv\b|\bproyector|\bbarra de sonido/, 'tv'],
      [/\bauriculares|\bcascos\b|\baltavoz|\bearbuds|\bairpods/, 'audio'],
      [/\bcamara|\bobjetivo\b|\bgopro|\bdron/, 'fotografia'],
      [/\bconsola|\bplaystation|\bps5\b|\bxbox|\bnintendo|\bvideojuego|\bmando\b/, 'gaming'],
      [/\baspirador|\bfrigorifico|\blavadora|\bmicroondas|\bcafetera|\bfreidora|\bhorno\b|\blavavajillas|\bplancha\b|\bbatidora|\brobot de cocina/, 'electrodomesticos'],
      [/\bbombilla inteligente|\benchufe inteligente|\balexa\b|\bgoogle home|\btermostato|\bcamara de vigilancia/, 'smart-home'],
    ],
  },
  {
    id: 'deporte',
    es: 'Deporte',
    en: 'Sports',
    types: ['ropa-deportiva', 'calzado-deportivo', 'fitness', 'ciclismo', 'outdoor', 'deportes-agua', 'raqueta', 'nutricion-deportiva', 'packs'],
    rules: [
      [/\bproteina|\bwhey\b|\bcreatina|\bbarritas?\b|\bgeles? energetic|\bisotonic/, 'nutricion-deportiva'],
      [/\bpalas? de padel|\bpadel\b|\braquetas?\b|\btenis\b|\bbadminton|\bpelotas de/, 'raqueta'],
      [/\bbicicleta|\bciclismo|\bmaillot|\bculotte|\bcasco de bici|\bmtb\b/, 'ciclismo'],
      [/\bzapatillas?\b|\bbotas de (futbol|montana)|\bcalzado/, 'calzado-deportivo'],
      [/\bmancuernas?\b|\bpesas\b|\besterilla|\bkettlebell|\bbanda elastica|\bcinta de correr|\bfitness|\byoga/, 'fitness'],
      [/\bsurf\b|\bneopreno|\bnatacion|\bpaddle surf|\bgafas de natacion|\bkayak/, 'deportes-agua'],
      [/\btienda de campana|\bsaco de dormir|\bsenderismo|\bmontana|\btrekking|\bescalada|\bmochila de/, 'outdoor'],
      [/\bcamisetas?\b|\bmallas?\b|\bpantalon|\bsudadera|\bchaqueta|\bsujetador deportivo|\bshorts?\b/, 'ropa-deportiva'],
    ],
  },
  {
    id: 'alimentacion',
    es: 'Alimentación y bebidas',
    en: 'Food & drinks',
    types: ['alimentacion', 'bebidas', 'vinos-licores', 'cafe-te', 'dulces-snacks', 'suplementos', 'packs'],
    rules: [
      [/\bpacks?\b|\blotes?\b|\bcestas?\b/, 'packs'],
      [/\bvino\b|\bcava\b|\bchampagne|\bginebra|\bgin\b|\bron\b|\bwhisky|\bvermut|\blicor|\bcerveza/, 'vinos-licores'],
      [/\bcafe\b|\bcapsulas|\bte\b|\binfusion|\bmatcha/, 'cafe-te'],
      [/\bchocolate|\bgalletas|\bcaramelos|\bsnacks?\b|\bpatatas fritas|\bturron|\bfrutos secos/, 'dulces-snacks'],
      [/\bzumo|\brefresco|\bagua\b|\bkombucha|\bbebida/, 'bebidas'],
    ],
  },
  {
    id: 'mascotas',
    es: 'Mascotas',
    en: 'Pets',
    types: ['comida-perro', 'comida-gato', 'accesorios-mascotas', 'higiene-mascotas', 'packs'],
    rules: [
      [/(pienso|comida|snack|premio|lata).*\bgatos?\b|\bgatos?\b.*(pienso|comida|humedo)/, 'comida-gato'],
      [/(pienso|comida|snack|premio|lata).*\bperros?\b|\bperros?\b.*(pienso|comida|humedo)/, 'comida-perro'],
      [/\bchampu|\bantiparasitario|\bpipeta|\bcollar antiparasit|\bhigiene|\barena\b/, 'higiene-mascotas'],
      [/\bcorrea|\bcollar|\barnes|\bcama\b|\bcomedero|\bbebedero|\bjuguete|\btransportin|\brascador/, 'accesorios-mascotas'],
    ],
  },
  {
    id: 'infantil',
    es: 'Bebé e infantil',
    en: 'Baby & kids',
    types: ['carritos-sillas', 'mobiliario-infantil', 'ropa-infantil', 'juguetes', 'cuidado-bebe', 'colchones-infantiles', 'packs'],
    rules: [
      [/\bcarrito|\bsilla de (coche|paseo|auto)|\bcochecito|\bportabebe|\bmochila portabebe/, 'carritos-sillas'],
      [/\bcolchon/, 'colchones-infantiles'],
      [/\bcuna\b|\bminicuna|\bcambiador|\btrona|\bparque infantil|\bcama infantil/, 'mobiliario-infantil'],
      [/\bjuguete|\bpeluche|\bpuzzle|\bjuego\b|\bmunec|\blego\b|\bsonajero/, 'juguetes'],
      [/\bbiberon|\bchupete|\bpanales|\btoallitas|\blactancia|\bsacaleches|\bpapilla/, 'cuidado-bebe'],
      [/\bbody\b|\bpijama|\bpelele|\bconjunto|\bvestido|\bcamiseta|\bpantalon/, 'ropa-infantil'],
    ],
  },
  {
    id: 'salud',
    es: 'Salud y bienestar',
    en: 'Health & wellness',
    types: ['suplementos', 'parafarmacia', 'ortopedia', 'facial', 'corporal', 'higiene', 'packs'],
    rules: [
      [/\bvitamina|\bcolageno|\bmagnesio|\bomega|\bprobiotic|\bsuplemento|\bcapsulas|\bmelatonina/, 'suplementos'],
      [/\bfaja|\brodillera|\bmunequera|\bplantillas|\bortopedic|\bcollarin|\bmasajeador/, 'ortopedia'],
    ],
  },
  { id: 'otro', es: 'Otro', en: 'Other', types: ['packs'], rules: [[/\bpacks?\b/, 'packs']] },
];

/** «pack de 4», «pack 2 unidades», «set de 6»… seguido de un solo tipo de producto. */
const SAME_ITEM_PACK = /\b(packs?|set|lote) (de )?\d+( (unidades|uds))?\b/;

const TYPE_BY_KEY = new Map(TYPES.map((t) => [t.key, t]));
const VERTICAL_BY_ID = new Map(VERTICALS.map((v) => [v.id, v]));

export const verticalOf = (id: string | null | undefined): VerticalDef | undefined => (id ? VERTICAL_BY_ID.get(id) : undefined);

/** Etiqueta de un tipo. Las claves desconocidas se muestran tal cual. */
export function typeLabel(key: string | null | undefined, locale: 'es' | 'en' = 'es'): string {
  if (!key) return locale === 'en' ? 'Unclassified' : 'Sin clasificar';
  return TYPE_BY_KEY.get(key)?.[locale] ?? key;
}

export const isTypeKey = (key: string): boolean => TYPE_BY_KEY.has(key);

/**
 * Tipos candidatos para unos sectores (los de los proyectos que siguen la web), sin repetir y con los
 * comunes al final. Sin sector conocido, todos los tipos.
 */
export function candidateTypes(verticals: (string | null | undefined)[]): string[] {
  const known = verticals.map(verticalOf).filter((v): v is VerticalDef => Boolean(v) && v!.id !== 'otro');
  const keys = known.length ? known.flatMap((v) => v.types) : TYPES.map((t) => t.key);
  return [...new Set([...keys, 'packs', 'tarjetas-regalo', 'otros'])];
}

/** Orden de los tipos en el panel para un sector: los del sector primero y después el resto por orden de TYPES. */
export function typeOrder(vertical: string | null | undefined): (key: string) => number {
  const own = verticalOf(vertical)?.types ?? [];
  const all = TYPES.map((t) => t.key);
  return (key) => {
    const i = own.indexOf(key);
    if (key === 'otros') return 10000;
    return i >= 0 ? i : 1000 + (all.indexOf(key) >= 0 ? all.indexOf(key) : 999);
  };
}

export const normalizeText = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Clasificación por reglas: título, después categoría de la tienda y por último la ruta de la URL.
 * Devuelve null si ninguna regla de los sectores dados encaja (entonces decide la IA).
 */
export function classifyByRules(
  p: { title: string; category?: string | null; url?: string | null },
  verticals: (string | null | undefined)[],
): string | null {
  const known = verticals.map(verticalOf).filter((v): v is VerticalDef => Boolean(v));
  const rules = [...COMMON, ...(known.length ? known : VERTICALS).flatMap((v) => v.rules)];
  let path = '';
  try {
    path = p.url ? decodeURIComponent(new URL(p.url).pathname).replace(/[-_/]+/g, ' ') : '';
  } catch {
    path = '';
  }
  for (const text of [p.title, p.category ?? '', path]) {
    let t = normalizeText(text);
    if (!t) continue;
    // "Pack de 2 sillas", "Patas - Pack 4 unidades": el mismo producto en lote se clasifica como ese producto.
    // Solo es "packs" la combinación de productos distintos (colchón + almohada…).
    const sameItem = SAME_ITEM_PACK.test(t);
    if (sameItem) t = t.replace(SAME_ITEM_PACK, ' ').trim();
    for (const [re, type] of rules) if ((!sameItem || type !== 'packs') && re.test(t)) return type;
  }
  return null;
}
