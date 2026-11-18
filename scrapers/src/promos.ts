import * as cheerio from 'cheerio';
import { getText } from './http.js';

/**
 * Promociones comunicadas en la home (topbar, barras de anuncio, banners, hero).
 *
 * Con la Directiva Ómnibus muchas marcas dejan de publicar precios tachados, pero siguen anunciando
 * su descuento principal en la home ("Hasta -40% en colchones", "Black Friday: 30% con el código BF30").
 * Este módulo extrae esos mensajes y los resume en: descuento principal, códigos, campañas y envío gratis.
 */

export interface PromoMessage {
  text: string;
  source: 'promo-block' | 'header' | 'hero' | 'script';
  discountPct: number | null; // mayor % de descuento del mensaje
  upTo: boolean; // "hasta un X%"
  amountOff: number | null; // "50 € de descuento"
  codes: string[];
  campaigns: string[];
  freeShipping: boolean;
  financing: boolean; // "0% TAE", "sin intereses" (no es un descuento)
  gift: boolean; // "regalo", "2x1"
}

export interface PromoSnapshot {
  pageUrl: string;
  messages: PromoMessage[];
  mainDiscountPct: number | null;
  upTo: boolean;
  codes: string[];
  campaigns: string[];
  freeShipping: boolean;
}

const PROMO_HINT =
  /announcement|annoucement|topbar|top-bar|top_bar|promo|banner|marquee|ticker|notice|header-message|header__message|hello-?bar|countdown|campaign|offer|ribbon|alert-bar|usp|discount|sale-bar/i;

const CAMPAIGNS: [RegExp, string][] = [
  [/black\s*friday|black\s*week|black\s*month/i, 'Black Friday'],
  [/cyber\s*(monday|week)/i, 'Cyber Monday'],
  [/rebajas/i, 'Rebajas'],
  [/singles'?\s*day|11\.11/i, 'Singles Day'],
  [/d[ií]as?\s+sin\s+iva|sin\s+iva/i, 'Días sin IVA'],
  [/navidad|christmas/i, 'Navidad'],
  [/san\s+valent[ií]n/i, 'San Valentín'],
  [/d[ií]a\s+de\s+la\s+madre/i, 'Día de la Madre'],
  [/d[ií]a\s+del\s+padre/i, 'Día del Padre'],
  [/aniversario/i, 'Aniversario'],
  [/outlet/i, 'Outlet'],
  [/prime\s*day/i, 'Prime Day'],
  [/vuelta\s+al\s+cole/i, 'Vuelta al cole'],
  [/flash|24\s*h|48\s*h|[úu]ltimas\s+horas/i, 'Oferta flash'],
];

const FINANCING = /(tae|tin|inter[eé]s|intereses|financ|cuotas|meses|aplazad)/i;
const NOT_DISCOUNT = /(algod[oó]n|lana|l[aá]tex|natural|reciclad|org[aá]nic|satisfac|clientes|valoraci|opiniones|recomienda|humedad|transpirab|garant)/i;

export const normalizeSpace = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Analiza un texto y devuelve el mensaje de promoción (o null si no contiene ninguna señal). */
export function analyzeMessage(text: string, source: PromoMessage['source']): PromoMessage | null {
  const t = normalizeSpace(text);
  if (t.length < 4 || t.length > 300) return null;

  let discountPct: number | null = null;
  let upTo = false;
  let financing = false;
  for (const m of t.matchAll(/(hasta(?:\s+un)?|up\s+to)?\s*[-–]?\s*(\d{1,2}(?:[.,]\d)?)\s?%/gi)) {
    const pct = Number(m[2].replace(',', '.'));
    const around = t.slice(Math.max(0, m.index! - 25), m.index! + m[0].length + 25);
    if (FINANCING.test(around)) {
      financing = true;
      continue;
    }
    if (NOT_DISCOUNT.test(around) || pct < 5 || pct > 90) continue;
    if (discountPct === null || pct > discountPct) {
      discountPct = pct;
      upTo = Boolean(m[1]);
    }
  }
  if (!financing && /sin\s+intereses|0\s?%\s?(tae|tin)/i.test(t)) financing = true;

  const amount = t.match(/(\d{1,4})\s?€\s?(?:de\s+)?(?:dto|descuento|de\s+regalo|off|menos)/i);
  const amountOff = amount ? Number(amount[1]) : null;

  const codes = [
    ...new Set(
      [...t.matchAll(/(?:c[oó]digo|cup[oó]n|code)\s*(?:promocional)?\s*:?\s*["“'«]?([A-Z0-9][A-Z0-9_-]{2,19})\b/gi)]
        .map((m) => m[1])
        .filter((c) => /[A-Z]/.test(c) && c === c.toUpperCase()),
    ),
  ];
  const campaigns = CAMPAIGNS.filter(([re]) => re.test(t)).map(([, name]) => name);
  const freeShipping = /env[ií]os?\s+(gratis|gratuitos?)|free\s+shipping|portes\s+gratis/i.test(t);
  const gift = /\bregalo\b|\b[23]x[12]\b|de\s+regalo|gratis\s+(una|un|la|el)\b/i.test(t);

  const hasSignal =
    discountPct !== null || amountOff !== null || codes.length > 0 || campaigns.length > 0 || freeShipping || gift;
  if (!hasSignal) return null;
  return { text: t, source, discountPct, upTo, amountOff, codes, campaigns, freeShipping, financing, gift };
}

/** Extrae los mensajes de promoción de la home. */
export function extractPromos(html: string, pageUrl: string): PromoSnapshot {
  const $ = cheerio.load(html);
  const scripts = $('script')
    .map((_, el) => $(el).html() ?? '')
    .get();
  $('script, style, noscript, svg, template, iframe').remove();

  const candidates: { text: string; source: PromoMessage['source'] }[] = [];
  const push = (text: string, source: PromoMessage['source']) => {
    const t = normalizeSpace(text);
    if (t) candidates.push({ text: t, source });
  };

  // 1. Bloques con nombre de promoción (topbar, announcement, banner…): se toman sus elementos de texto
  $('[class], [id]').each((_, el) => {
    const attrs = `${$(el).attr('class') ?? ''} ${$(el).attr('id') ?? ''}`;
    if (!PROMO_HINT.test(attrs)) return;
    const leaves = $(el).find('p, span, a, strong, b, h1, h2, h3, h4, div').filter((_, c) => $(c).children().length === 0);
    if (leaves.length) leaves.each((__, c) => push($(c).text(), 'promo-block'));
    else push($(el).text(), 'promo-block');
    // También el bloque completo, por si el mensaje está repartido en varios elementos
    const whole = normalizeSpace($(el).text());
    if (whole.length <= 200) push(whole, 'promo-block');
  });

  // 2. Cabecera y hero: titulares y enlaces destacados
  $('header').find('p, span, a, strong, div').filter((_, c) => $(c).children().length === 0).each((_, c) => push($(c).text(), 'header'));
  $('main h1, main h2, body > div h1, body > div h2').slice(0, 12).each((_, c) => push($(c).text(), 'hero'));

  let messages = dedupeMessages(
    candidates.map((c) => analyzeMessage(c.text, c.source)).filter((m): m is PromoMessage => m !== null),
  );

  // 3. Webs que pintan la topbar con JavaScript: se buscan los textos dentro de los datos de la página
  if (!messages.some((m) => m.discountPct !== null || m.campaigns.length)) {
    const strings = scripts.flatMap((s) =>
      [...s.matchAll(/"((?:[^"\\]|\\.){6,200}?)"/g)]
        .map((m) => m[1].replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(.)/g, '$1'))
        .filter((x) => /%|black|cyber|descuento|dto|rebaja|c[oó]digo|env[ií]o gratis/i.test(x) && !/[{}<>]|https?:|\.(js|css|png|jpg)/i.test(x)),
    );
    messages = dedupeMessages([
      ...messages,
      ...strings.map((s) => analyzeMessage(s, 'script')).filter((m): m is PromoMessage => m !== null),
    ]);
  }

  return summarize(pageUrl, messages);
}

/** Quita mensajes repetidos o contenidos en otro más largo con la misma información. */
export function dedupeMessages(messages: PromoMessage[]): PromoMessage[] {
  const byText = new Map<string, PromoMessage>();
  for (const m of messages) {
    const key = m.text.toLowerCase();
    if (!byText.has(key)) byText.set(key, m);
  }
  const list = [...byText.values()].sort((a, b) => a.text.length - b.text.length);
  const kept: PromoMessage[] = [];
  for (const m of list) {
    const lower = m.text.toLowerCase();
    // Si un mensaje más corto ya contiene todo este texto, o este contiene a uno corto con las mismas señales, se queda el corto
    const duplicate = kept.some(
      (k) => lower.includes(k.text.toLowerCase()) && k.discountPct === m.discountPct && sameList(k.codes, m.codes),
    );
    if (!duplicate) kept.push(m);
  }
  return kept.slice(0, 20);
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

const SOURCE_WEIGHT: Record<PromoMessage['source'], number> = { 'promo-block': 3, header: 2, hero: 2, script: 1 };

export function summarize(pageUrl: string, messages: PromoMessage[]): PromoSnapshot {
  // Descuento principal: el mayor % de las fuentes más fiables (bloques de promoción > cabecera/hero > scripts)
  const withPct = messages.filter((m) => m.discountPct !== null);
  const bestWeight = Math.max(0, ...withPct.map((m) => SOURCE_WEIGHT[m.source]));
  const main = withPct
    .filter((m) => SOURCE_WEIGHT[m.source] === bestWeight)
    .sort((a, b) => b.discountPct! - a.discountPct!)[0];
  return {
    pageUrl,
    messages,
    mainDiscountPct: main?.discountPct ?? null,
    upTo: main?.upTo ?? false,
    codes: [...new Set(messages.flatMap((m) => m.codes))],
    campaigns: [...new Set(messages.flatMap((m) => m.campaigns))],
    freeShipping: messages.some((m) => m.freeShipping),
  };
}

export async function scrapePromos(baseUrl: string): Promise<PromoSnapshot> {
  const { text, finalUrl } = await getText(baseUrl, { retries: 2, accept: 'text/html' });
  return extractPromos(text, finalUrl);
}
