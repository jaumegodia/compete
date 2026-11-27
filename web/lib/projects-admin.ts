import 'server-only';
import type { Session } from './auth';
import { db, must } from './db';
import { dispatchCapture } from './github';

// Altas de proyectos y marcas. No es un archivo 'use server': estas funciones confían en la sesión que
// reciben y nunca deben poder llamarse directamente desde el navegador.

export function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error('Indica la URL de la web.');
  const u = new URL(value.startsWith('http') ? value : `https://${value}`);
  if (!u.hostname.includes('.')) throw new Error(`«${value}» no parece una web.`);
  return `${u.protocol}//${u.host.toLowerCase()}`;
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'proyecto';


/** Marca de una web ya dada de alta (las webs se comparten entre proyectos y clientes). */
async function brandOfUrl(url: string) {
  const row = must(await db().from('sites').select('brand_id, brand:brands(name)').eq('base_url', url).maybeSingle(), 'site') as unknown as {
    brand_id: string;
    brand: { name: string };
  } | null;
  return row && { id: row.brand_id, name: row.brand.name };
}

/** Crea marca y web, o reutiliza la marca si la web ya se captura (con todo su histórico). */
export async function brandForUrl(name: string, url: string): Promise<{ id: string; name: string; reused: boolean }> {
  const existing = await brandOfUrl(url);
  if (existing) return { ...existing, reused: true };
  const brand = must(await db().from('brands').insert({ name }).select('id').single(), 'insert brand') as { id: string };
  must(await db().from('sites').insert({ brand_id: brand.id, base_url: url }), 'insert site');
  return { id: brand.id, name, reused: false };
}

export interface NewProjectInput {
  name: string;
  url: string;
  country?: string;
  vertical?: string;
  competitors?: { name: string; url: string }[];
}

/**
 * Crea un proyecto en el workspace del usuario, con sus competidores, y lanza la primera captura de las
 * webs nuevas. Devuelve el slug o un mensaje de error. Lo usan el alta guiada y Marcas y webs.
 */
export async function createProjectFor(session: Session, input: NewProjectInput): Promise<{ slug: string } | { error: string }> {
  const ws = session.workspace;
  if (!session.isAdmin) {
    if (!ws.live) return { error: 'Tu prueba o suscripción ha terminado. Elige un plan en Cuenta para seguir.' };
    const { count } = await db().from('projects').select('id', { count: 'exact', head: true }).eq('workspace_id', ws.id);
    if ((count ?? 0) >= ws.plan.max_projects) {
      return { error: `Tu plan ${ws.plan.name} permite ${ws.plan.max_projects} proyecto${ws.plan.max_projects === 1 ? '' : 's'}. Cambia de plan en Cuenta para crear más.` };
    }
  }
  const maxCompetitors = session.isAdmin ? 100 : ws.plan.max_competitors;
  let url: string;
  const competitors: { name: string; url: string }[] = [];
  try {
    if (!input.name.trim()) throw new Error('Indica el nombre de tu marca.');
    url = normalizeUrl(input.url);
    for (const c of input.competitors ?? []) {
      if (!c.url.trim()) continue;
      const cu = normalizeUrl(c.url);
      if (cu === url || competitors.some((x) => x.url === cu)) continue;
      competitors.push({ name: c.name.trim() || new URL(cu).hostname.replace(/^www\./, '').split('.')[0], url: cu });
    }
    if (competitors.length > maxCompetitors) throw new Error(`Tu plan permite ${maxCompetitors} competidores por proyecto.`);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const own = await brandForUrl(input.name.trim(), url);
  const taken = new Set((must(await db().from('projects').select('slug'), 'projects') as { slug: string }[]).map((p) => p.slug));
  const base = slugify(input.name);
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  const project = must(
    await db()
      .from('projects')
      .insert({ slug, name: input.name.trim(), own_brand_id: own.id, workspace_id: ws.id, country: (input.country || 'ES').toUpperCase(), vertical: input.vertical || null })
      .select('id')
      .single(),
    'insert project',
  ) as { id: string };

  const fresh: string[] = own.reused ? [] : [new URL(url).host];
  for (const c of competitors) {
    const b = await brandForUrl(c.name, c.url);
    if (b.id === own.id) continue;
    await db().from('project_competitors').upsert({ project_id: project.id, brand_id: b.id });
    if (!b.reused) fresh.push(new URL(c.url).host);
  }
  // Primera captura solo de las webs que no se capturaban todavía (las demás ya tienen histórico)
  if (fresh.length) await dispatchCapture(fresh.join(',')).catch((e) => console.warn(`No se ha podido lanzar la captura: ${(e as Error).message}`));
  return { slug };
}

