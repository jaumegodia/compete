'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, must } from '@/lib/db';
import { dispatchCapture } from '@/lib/github';
import { projectPath } from '@/lib/project';

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error('Indica la URL de la web.');
  const u = new URL(value.startsWith('http') ? value : `https://${value}`);
  return `${u.protocol}//${u.host}`;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'proyecto';

/** Vuelve a Marcas y webs del proyecto con un aviso. */
function back(project: string, message?: string, error = false): never {
  revalidatePath('/', 'layout');
  redirect(`${projectPath(project, '/marcas')}${message ? `?${error ? 'error' : 'ok'}=${encodeURIComponent(message)}` : ''}`);
}

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

async function projectBySlug(slug: string) {
  return must(await db().from('projects').select('id, own_brand_id').eq('slug', slug).maybeSingle(), 'project') as {
    id: string;
    own_brand_id: string;
  } | null;
}

/** Marca de una web ya dada de alta (las webs se comparten entre proyectos). */
async function brandOfUrl(url: string) {
  const row = must(await db().from('sites').select('brand_id, brand:brands(name)').eq('base_url', url).maybeSingle(), 'site') as unknown as {
    brand_id: string;
    brand: { name: string };
  } | null;
  return row && { id: row.brand_id, name: row.brand.name };
}

/** Crea marca y web, o reutiliza la marca si la web ya se captura para otro proyecto. */
async function brandForUrl(name: string, url: string): Promise<{ id: string; name: string; reused: boolean }> {
  const existing = await brandOfUrl(url);
  if (existing) return { ...existing, reused: true };
  const brand = must(await db().from('brands').insert({ name }).select('id').single(), 'insert brand') as { id: string };
  must(await db().from('sites').insert({ brand_id: brand.id, base_url: url }), 'insert site');
  return { id: brand.id, name, reused: false };
}

/** Añade un competidor al proyecto. */
export async function addBrand(form: FormData) {
  const slug = field(form, 'project');
  const name = field(form, 'name');
  let url: string;
  try {
    if (!name) throw new Error('Indica el nombre de la marca.');
    url = normalizeUrl(field(form, 'url'));
  } catch (e) {
    back(slug, (e as Error).message, true);
  }
  const project = await projectBySlug(slug);
  if (!project) back(slug, 'El proyecto no existe.', true);

  const brand = await brandForUrl(name, url);
  if (brand.id === project.own_brand_id) back(slug, `${url} es la web de la marca propia de este proyecto.`, true);
  must(await db().from('project_competitors').upsert({ project_id: project.id, brand_id: brand.id }), 'link');
  back(
    slug,
    brand.reused
      ? `${url} ya se capturaba como ${brand.name}: se ha añadido a este proyecto con todo su histórico.`
      : `${name} añadida. Se capturará en la próxima ejecución diaria, o lánzala ahora con "Capturar".`,
  );
}

export async function addSite(form: FormData) {
  const slug = field(form, 'project');
  const brandId = field(form, 'brand_id');
  let url: string;
  try {
    url = normalizeUrl(field(form, 'url'));
  } catch (e) {
    back(slug, (e as Error).message, true);
  }
  const res = await db().from('sites').insert({ brand_id: brandId, base_url: url });
  if (res.error) back(slug, `No se ha podido añadir la web: ${res.error.message}`, true);
  back(slug, `Web ${url} añadida.`);
}

export async function setSiteActive(form: FormData) {
  const slug = field(form, 'project');
  const active = form.get('active') === 'true';
  must(await db().from('sites').update({ active }).eq('id', field(form, 'site_id')), 'update site');
  back(slug, active ? 'Web reactivada.' : 'Web pausada: no se capturará hasta que la reactives (en ningún proyecto).');
}

/** Añade o quita una marca ya dada de alta como competidora del proyecto. */
export async function toggleCompetitor(form: FormData) {
  const slug = field(form, 'project');
  const project = await projectBySlug(slug);
  if (!project) back(slug, 'El proyecto no existe.', true);
  const brandId = field(form, 'brand_id');
  if (form.get('linked') === 'true') {
    must(await db().from('project_competitors').delete().eq('project_id', project.id).eq('brand_id', brandId), 'unlink');
  } else {
    must(await db().from('project_competitors').insert({ project_id: project.id, brand_id: brandId }), 'link');
  }
  back(slug);
}

/** Borra una marca y todo su histórico. Solo si no la usa ningún otro proyecto. */
export async function deleteBrand(form: FormData) {
  const slug = field(form, 'project');
  const id = field(form, 'brand_id');
  const name = field(form, 'name');
  if (field(form, 'confirm').toLowerCase() !== name.toLowerCase()) {
    back(slug, `Para borrar ${name} escribe su nombre exacto en la casilla de confirmación.`, true);
  }
  const [owners, links] = await Promise.all([
    db().from('projects').select('slug, name').eq('own_brand_id', id),
    db().from('project_competitors').select('project:projects(slug, name)').eq('brand_id', id),
  ]);
  const own = must(owners, 'projects') as { slug: string; name: string }[];
  if (own.length) back(slug, `${name} es la marca propia del proyecto ${own[0].name}: borra antes el proyecto.`, true);
  const others = (must(links, 'links') as unknown as { project: { slug: string; name: string } }[])
    .map((l) => l.project)
    .filter((p) => p.slug !== slug);
  if (others.length) {
    back(slug, `${name} también está en ${others.map((p) => p.name).join(', ')}. Quítala solo de este proyecto en la lista de competidores.`, true);
  }
  must(await db().from('brands').delete().eq('id', id), 'delete brand');
  back(slug, `${name} y todo su histórico se han borrado.`);
}

/** Nuevo proyecto: la marca propia y su web. Si la web ya se captura, se reutiliza su marca e histórico. */
export async function createProject(form: FormData) {
  const from = field(form, 'from') || '/';
  const fail = (message: string): never => redirect(`${from}${from.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
  const name = field(form, 'name');
  let url = '';
  try {
    if (!name) throw new Error('Indica el nombre de la marca.');
    url = normalizeUrl(field(form, 'url'));
  } catch (e) {
    fail((e as Error).message);
  }
  const brand = await brandForUrl(name, url);
  const taken = new Set((must(await db().from('projects').select('slug'), 'projects') as { slug: string }[]).map((p) => p.slug));
  const base = slugify(name);
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  must(await db().from('projects').insert({ slug, name, own_brand_id: brand.id }), 'insert project');
  back(
    slug,
    `Proyecto ${name} creado${brand.reused ? ` con la marca ${brand.name}, que ya se capturaba` : ''}. Añade ahora sus competidores.`,
  );
}

/** Borra el proyecto. Las marcas y su histórico se conservan (pueden estar en otros proyectos). */
export async function deleteProject(form: FormData) {
  const slug = field(form, 'project');
  const name = field(form, 'name');
  if (field(form, 'confirm').toLowerCase() !== name.toLowerCase()) {
    back(slug, `Para borrar el proyecto escribe "${name}" en la casilla de confirmación.`, true);
  }
  must(await db().from('projects').delete().eq('slug', slug), 'delete project');
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function runCapture(form: FormData) {
  const slug = field(form, 'project');
  const site = field(form, 'site');
  const mode = (field(form, 'mode') || 'full') as 'full' | 'promos';
  try {
    await dispatchCapture(site, mode);
  } catch (e) {
    back(slug, (e as Error).message, true);
  }
  back(slug, `Captura lanzada${site ? ` para ${site}` : ''}. Tarda entre 1 y 12 minutos; el resultado aparecerá en Capturas.`);
}
