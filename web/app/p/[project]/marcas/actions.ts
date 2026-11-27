'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession, type Session } from '@/lib/auth';
import { db, must } from '@/lib/db';
import { dispatchCapture } from '@/lib/github';
import { brandForUrl, createProjectFor, normalizeUrl } from '@/lib/projects-admin';
import { getProject, projectPath, type Project } from '@/lib/project';

/** Vuelve a Marcas y webs del proyecto con un aviso. */
function back(project: string, message?: string, error = false): never {
  revalidatePath('/', 'layout');
  redirect(`${projectPath(project, '/marcas')}${message ? `?${error ? 'error' : 'ok'}=${encodeURIComponent(message)}` : ''}`);
}

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

/**
 * Proyecto que el usuario puede editar: es miembro de su workspace (o admin). Si no, 404 implícito:
 * se le devuelve a la raíz sin decir si el proyecto existe.
 */
async function editableProject(slug: string): Promise<{ project: Project; session: Session }> {
  const session = await getSession();
  if (!session) redirect('/login');
  const project = must(
    await db().from('projects').select('id, slug, name, own_brand_id, workspace_id, country, vertical, paused_at, created_at').eq('slug', slug).maybeSingle(),
    'project',
  ) as Project | null;
  const member = project && session.workspaces.some((w) => w.id === project.workspace_id);
  if (!project || (!member && !session.isAdmin)) redirect('/app');
  return { project, session };
}

function requireAdmin(session: Session, slug: string) {
  if (!session.isAdmin) back(slug, 'Solo el equipo de COMPETE puede hacer este cambio.', true);
}

/** Plan del workspace dueño del proyecto (el admin puede editar proyectos de otros workspaces). */
async function planOf(workspaceId: string) {
  const row = must(await db().from('workspaces').select('plan:plans(id, name, max_projects, max_competitors)').eq('id', workspaceId).single(), 'plan') as unknown as {
    plan: { id: string; name: string; max_projects: number; max_competitors: number };
  };
  return row.plan;
}

/** Competidores activos (sin pausar) del proyecto. Los pausados no cuentan para el límite del plan. */
async function activeCompetitors(projectId: string): Promise<number> {
  const { count, error } = await db().from('project_competitors').select('brand_id', { count: 'exact', head: true }).eq('project_id', projectId).is('paused_at', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function checkCompetitorLimit(project: Project, session: Session) {
  if (session.isAdmin) return;
  const plan = await planOf(project.workspace_id);
  if ((await activeCompetitors(project.id)) >= plan.max_competitors) {
    back(project.slug, `Tu plan ${plan.name} permite ${plan.max_competitors} competidores por proyecto. Pausa uno o cambia de plan en Cuenta.`, true);
  }
}

/** ¿Usa la marca algún proyecto de otro workspace? Entonces sus webs no se tocan desde aquí. */
async function sharedOutside(brandId: string, workspaceId: string): Promise<boolean> {
  const [own, comp] = await Promise.all([
    db().from('projects').select('workspace_id').eq('own_brand_id', brandId),
    db().from('project_competitors').select('project:projects(workspace_id)').eq('brand_id', brandId),
  ]);
  const ws = [
    ...(must(own, 'projects') as { workspace_id: string }[]).map((p) => p.workspace_id),
    ...(must(comp, 'links') as unknown as { project: { workspace_id: string } }[]).map((l) => l.project.workspace_id),
  ];
  return ws.some((w) => w !== workspaceId);
}

/** Añade un competidor al proyecto. */
export async function addBrand(form: FormData) {
  const slug = field(form, 'project');
  const { project, session } = await editableProject(slug);
  const name = field(form, 'name');
  let url = '';
  try {
    if (!name) throw new Error('Indica el nombre de la marca.');
    url = normalizeUrl(field(form, 'url'));
  } catch (e) {
    back(slug, (e as Error).message, true);
  }
  await checkCompetitorLimit(project, session);
  const brand = await brandForUrl(name, url);
  if (brand.id === project.own_brand_id) back(slug, `${url} es la web de tu propia marca en este proyecto.`, true);
  must(await db().from('project_competitors').upsert({ project_id: project.id, brand_id: brand.id, paused_at: null }), 'link');
  if (!brand.reused) await dispatchCapture(new URL(url).host).catch(() => undefined);
  back(
    slug,
    brand.reused
      ? `${name} añadida. Ya teníamos histórico de ${new URL(url).host}: lo verás desde hoy.`
      : `${name} añadida. La primera captura empieza ahora y tarda unos minutos; los cambios se registran a partir de mañana.`,
  );
}

export async function addSite(form: FormData) {
  const slug = field(form, 'project');
  const { project, session } = await editableProject(slug);
  const brandId = field(form, 'brand_id');
  if (!session.isAdmin && (await sharedOutside(brandId, project.workspace_id))) {
    back(slug, 'Esta marca la siguen también otros clientes: escríbenos para añadirle webs.', true);
  }
  let url = '';
  try {
    url = normalizeUrl(field(form, 'url'));
  } catch (e) {
    back(slug, (e as Error).message, true);
  }
  const res = await db().from('sites').insert({ brand_id: brandId, base_url: url });
  if (res.error) back(slug, res.error.code === '23505' ? `${url} ya está dada de alta en otra marca.` : `No se ha podido añadir la web: ${res.error.message}`, true);
  await dispatchCapture(new URL(url).host).catch(() => undefined);
  back(slug, `Web ${url} añadida.`);
}

/** Interruptor global de una web (todos los proyectos y clientes). Solo admin. */
export async function setSiteActive(form: FormData) {
  const slug = field(form, 'project');
  const { session } = await editableProject(slug);
  requireAdmin(session, slug);
  const active = form.get('active') === 'true';
  must(await db().from('sites').update({ active }).eq('id', field(form, 'site_id')), 'update site');
  back(slug, active ? 'Web reactivada para todos los proyectos.' : 'Web desactivada en todos los proyectos y clientes.');
}

/**
 * Pausa o reanuda un competidor solo en este proyecto. Si otro proyecto (de este u otro cliente) sigue
 * la web, se sigue capturando para él; aquí se conserva el histórico hasta la pausa.
 */
export async function setCompetitorPaused(form: FormData) {
  const slug = field(form, 'project');
  const { project, session } = await editableProject(slug);
  const brandId = field(form, 'brand_id');
  const pause = form.get('paused') === 'true';
  if (!pause) await checkCompetitorLimit(project, session);
  must(
    await db()
      .from('project_competitors')
      .update({ paused_at: pause ? new Date().toISOString() : null })
      .eq('project_id', project.id)
      .eq('brand_id', brandId),
    'pause',
  );
  back(slug, pause ? 'Competidor pausado en este proyecto: deja de capturarse para ti y no cuenta en tu plan.' : 'Competidor reanudado.');
}

/** Pausa o reanuda todo el proyecto (marca propia y competidores). */
export async function setProjectPaused(form: FormData) {
  const slug = field(form, 'project');
  const { project } = await editableProject(slug);
  const pause = form.get('paused') === 'true';
  must(await db().from('projects').update({ paused_at: pause ? new Date().toISOString() : null }).eq('id', project.id), 'pause project');
  back(slug, pause ? 'Proyecto pausado: no se captura nada para él hasta que lo reanudes.' : 'Proyecto reanudado.');
}

/** Añade o quita una marca como competidora del proyecto. Añadir una marca existente por id es solo para admin. */
export async function toggleCompetitor(form: FormData) {
  const slug = field(form, 'project');
  const { project, session } = await editableProject(slug);
  const brandId = field(form, 'brand_id');
  if (form.get('linked') === 'true') {
    must(await db().from('project_competitors').delete().eq('project_id', project.id).eq('brand_id', brandId), 'unlink');
  } else {
    requireAdmin(session, slug);
    must(await db().from('project_competitors').insert({ project_id: project.id, brand_id: brandId }), 'link');
  }
  back(slug);
}

/** Borra una marca y todo su histórico. Solo admin y solo si no la usa ningún otro proyecto. */
export async function deleteBrand(form: FormData) {
  const slug = field(form, 'project');
  const { session } = await editableProject(slug);
  requireAdmin(session, slug);
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

/** Nuevo proyecto desde Marcas y webs: la marca propia y su web. */
export async function createProject(form: FormData) {
  const from = field(form, 'from') || '/app';
  const fail = (message: string): never => redirect(`${from}${from.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
  const session = await getSession();
  if (!session) redirect('/login');
  const res = await createProjectFor(session, { name: field(form, 'name'), url: field(form, 'url'), country: field(form, 'country') });
  if ('error' in res) fail(res.error);
  back((res as { slug: string }).slug, 'Proyecto creado. Añade ahora sus competidores.');
}

/** Borra el proyecto. Las marcas y su histórico se conservan (pueden estar en otros proyectos). */
export async function deleteProject(form: FormData) {
  const slug = field(form, 'project');
  const { project } = await editableProject(slug);
  const name = field(form, 'name');
  if (field(form, 'confirm').toLowerCase() !== name.toLowerCase()) {
    back(slug, `Para borrar el proyecto escribe "${name}" en la casilla de confirmación.`, true);
  }
  must(await db().from('projects').delete().eq('id', project.id), 'delete project');
  revalidatePath('/', 'layout');
  redirect('/app');
}

/** Lanza una captura ahora. Los clientes solo pueden lanzar las webs de su proyecto; "todo" es solo admin. */
export async function runCapture(form: FormData) {
  const slug = field(form, 'project');
  const { session } = await editableProject(slug);
  const site = field(form, 'site');
  if (!site) requireAdmin(session, slug);
  else if (!session.isAdmin) {
    // Solo webs de este proyecto
    const ctx = await getProject(slug);
    if (!ctx.sites.some((s) => new URL(s.base_url).host === site)) back(slug, 'Esa web no está en este proyecto.', true);
  }
  const mode = (field(form, 'mode') || 'full') as 'full' | 'promos';
  try {
    await dispatchCapture(site, mode);
  } catch (e) {
    back(slug, (e as Error).message, true);
  }
  back(slug, `Captura lanzada${site ? ` para ${site}` : ''}. Tarda entre 1 y 12 minutos; el resultado aparecerá en Capturas.`);
}
