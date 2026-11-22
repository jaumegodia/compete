import { getDb, must } from './db.js';
import { dfsRequest, isAuthError, SPAIN } from './dataforseo.js';

/**
 * Tráfico y SEO por dominio con DataForSEO Labs (Google España).
 *
 *   npm run seo                     -> todas las webs activas: histórico mensual + top keywords
 *   npm run seo -- --site emma      -> solo las webs cuya URL contiene "emma"
 *   npm run seo -- --dry-run        -> llama a la API pero no guarda nada (muestra el resumen)
 *
 * Endpoints (modo live; Labs no tiene modo task):
 *   - historical_rank_overview: tráfico orgánico/pago, keywords y posiciones, mes a mes.
 *   - ranked_keywords: las N keywords orgánicas que más tráfico llevan a la web.
 * Credenciales: DATAFORSEO_LOGIN y DATAFORSEO_PASSWORD. Variables opcionales: SEO_KEYWORDS (N, 100 por defecto).
 */

// ---------- Parseo (puro, probado en test/seo.test.ts) ----------

/** "https://www.maxcolchon.com/" → "maxcolchon.com" */
export function domainOf(baseUrl: string): string {
  return new URL(baseUrl).hostname.replace(/^www\./, '').toLowerCase();
}

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v: unknown): number | null => {
  const x = n(v);
  return x === null ? null : Math.round(x);
};
const sumPos = (o: Record<string, unknown>, from: number) =>
  Object.entries(o)
    .filter(([k]) => /^pos_\d+_\d+$/.test(k) && Number(k.split('_')[1]) >= from)
    .reduce((s, [, v]) => s + (n(v) ?? 0), 0);

export interface DomainMonth {
  month: string; // AAAA-MM-01
  organic_etv: number | null;
  organic_keywords: number | null;
  organic_pos_1: number | null;
  organic_pos_2_3: number | null;
  organic_pos_4_10: number | null;
  organic_pos_11_100: number | null;
  organic_traffic_value: number | null;
  organic_new: number | null;
  organic_lost: number | null;
  paid_etv: number | null;
  paid_keywords: number | null;
  paid_traffic_cost: number | null;
  raw: unknown;
}

/** Items de historical_rank_overview → una fila por mes. */
export function parseHistory(items: any[]): DomainMonth[] {
  return (items ?? [])
    .filter((i) => i?.year && i?.month)
    .map((i) => {
      const o = i.metrics?.organic ?? {};
      const p = i.metrics?.paid ?? {};
      return {
        month: `${i.year}-${String(i.month).padStart(2, '0')}-01`,
        organic_etv: n(o.etv),
        organic_keywords: int(o.count),
        organic_pos_1: int(o.pos_1),
        organic_pos_2_3: int(o.pos_2_3),
        organic_pos_4_10: int(o.pos_4_10),
        organic_pos_11_100: Object.keys(o).length ? sumPos(o, 11) : null,
        organic_traffic_value: n(o.estimated_paid_traffic_cost),
        organic_new: int(o.is_new),
        organic_lost: int(o.is_lost),
        paid_etv: n(p.etv),
        paid_keywords: int(p.count),
        paid_traffic_cost: n(p.estimated_paid_traffic_cost),
        raw: i.metrics ?? null,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface RankedKeyword {
  keyword: string;
  position: number | null;
  search_volume: number | null;
  etv: number | null;
  cpc: number | null;
  url: string | null;
}

/** Items de ranked_keywords → keywords (sin duplicados, la de más tráfico manda). */
export function parseRankedKeywords(items: any[]): RankedKeyword[] {
  const out = new Map<string, RankedKeyword>();
  for (const i of items ?? []) {
    const keyword = i?.keyword_data?.keyword;
    const serp = i?.ranked_serp_element?.serp_item ?? {};
    if (!keyword) continue;
    const row: RankedKeyword = {
      keyword,
      position: int(serp.rank_group ?? serp.rank_absolute),
      search_volume: int(i.keyword_data?.keyword_info?.search_volume),
      etv: n(serp.etv),
      cpc: n(i.keyword_data?.keyword_info?.cpc),
      url: serp.url ?? null,
    };
    const prev = out.get(keyword);
    if (!prev || (row.etv ?? 0) > (prev.etv ?? 0)) out.set(keyword, row);
  }
  return [...out.values()].sort((a, b) => (b.etv ?? 0) - (a.etv ?? 0));
}

// ---------- DataForSEO ----------

/** Sin date_from la API solo devuelve los últimos 6 meses; Labs tiene histórico desde octubre de 2020. */
const HISTORY_FROM = '2020-10-01';
const monthsAgo = (k: number) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - k);
  return d.toISOString().slice(0, 10);
};

/** Una tarea live de Labs. Devuelve result[0] y el coste. */
export async function labs(endpoint: string, task: Record<string, unknown>): Promise<{ result: any; cost: number }> {
  const json = await dfsRequest(`/dataforseo_labs/google/${endpoint}/live`, [{ ...SPAIN, ...task }]);
  const t = json.tasks?.[0];
  if (!t) throw new Error('DataForSEO: respuesta sin tareas');
  if (t.status_code !== 20000) throw new Error(`DataForSEO ${endpoint}: ${t.status_code} ${t.status_message}`);
  return { result: t.result?.[0] ?? null, cost: Number(t.cost ?? 0) };
}

// ---------- Ejecución ----------

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const siteIdx = args.indexOf('--site');
  const filter = siteIdx >= 0 ? args[siteIdx + 1] : process.env.SITE || '';
  const topN = Number(process.env.SEO_KEYWORDS ?? 100);
  const today = new Date().toISOString().slice(0, 10);

  const db = getDb();
  const sites = (
    must(await db.from('sites').select('id, base_url, active').eq('active', true).order('created_at'), 'sites') as {
      id: string;
      base_url: string;
    }[]
  ).filter((s) => !filter || s.base_url.includes(filter));
  if (!sites.length) throw new Error(`Ninguna web activa${filter ? ` contiene «${filter}»` : ''}.`);

  let totalCost = 0;
  let failures = 0;
  for (const site of sites) {
    const domain = domainOf(site.base_url);
    console.log(`→ ${domain}`);
    try {
      // El histórico completo se paga por mes: solo la primera vez; después, los últimos 3 meses
      const { count } = await db.from('domain_metrics').select('month', { count: 'exact', head: true }).eq('site_id', site.id);
      const from = (count ?? 0) >= 12 && !process.env.SEO_FULL_HISTORY ? monthsAgo(3) : HISTORY_FROM;
      const hist = await labs('historical_rank_overview', { target: domain, date_from: from });
      const months = parseHistory(hist.result?.items ?? []);
      totalCost += hist.cost;
      const last = months.at(-1);
      console.log(
        `  histórico: ${months.length} meses` +
          (last
            ? ` · ${last.month.slice(0, 7)}: ${Math.round(last.organic_etv ?? 0).toLocaleString('es-ES')} visitas orgánicas/mes, ` +
              `${(last.organic_keywords ?? 0).toLocaleString('es-ES')} keywords, ${Math.round(last.paid_etv ?? 0).toLocaleString('es-ES')} de pago`
            : ''),
      );

      const ranked = await labs('ranked_keywords', {
        target: domain,
        limit: topN,
        item_types: ['organic'],
        order_by: ['ranked_serp_element.serp_item.etv,desc'],
      });
      const keywords = parseRankedKeywords(ranked.result?.items ?? []);
      totalCost += ranked.cost;
      console.log(
        `  keywords: ${keywords.length} (total en el top 100: ${ranked.result?.total_count ?? '?'})` +
          (keywords.length ? ` · top: ${keywords.slice(0, 3).map((k) => `«${k.keyword}» #${k.position}`).join(', ')}` : ''),
      );

      if (dry) continue;
      if (months.length) {
        must(
          await db.from('domain_metrics').upsert(
            months.map((m) => ({ ...m, site_id: site.id, fetched_at: new Date().toISOString() })),
            { onConflict: 'site_id,month' },
          ),
          'domain_metrics',
        );
      }
      if (keywords.length) {
        must(await db.from('domain_keywords').delete().eq('site_id', site.id).eq('captured_on', today), 'domain_keywords (borrar)');
        must(
          await db.from('domain_keywords').insert(keywords.map((k) => ({ ...k, site_id: site.id, captured_on: today }))),
          'domain_keywords',
        );
      }
    } catch (e) {
      failures++;
      console.error(`  error: ${(e as Error).message}`);
      if (isAuthError(e)) break;
    }
  }
  console.log(`Coste DataForSEO: ${totalCost.toFixed(4)} $${dry ? ' (sin guardar: --dry-run)' : ''}`);
  if (failures) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
