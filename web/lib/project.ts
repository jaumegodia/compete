import 'server-only';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getSession, type Session, type Workspace } from './auth';
import { db, must } from './db';
import { getAllBrands, getSites, type BrandSummary, type Site } from './queries';

/**
 * Un proyecto es un mercado: una marca propia y sus competidores. Todo el panel se ve dentro de un
 * proyecto (/p/<slug>/…) y solo muestra las marcas y webs de ese proyecto.
 */
export interface Project {
  id: string;
  slug: string;
  name: string;
  own_brand_id: string;
  workspace_id: string;
  country: string;
  vertical: string | null;
  paused_at: string | null;
  created_at: string;
}

const PROJECT_COLUMNS = 'id, slug, name, own_brand_id, workspace_id, country, vertical, paused_at, created_at';

export interface ProjectContext {
  project: Project;
  /** Marcas del proyecto: la propia primero (con is_own = true) y luego las competidoras por orden de alta. */
  brands: BrandSummary[];
  /** Todas las webs de las marcas del proyecto (activas y pausadas). */
  sites: Site[];
  siteIds: string[];
  /** Competidores pausados en este proyecto (no se capturan para él, pero se conserva su histórico). */
  pausedBrandIds: Set<string>;
  /** Workspace dueño del proyecto (el del usuario, o cualquiera si es admin). */
  workspace: Workspace | null;
  session: Session;
  /** Puede editar el proyecto: es miembro del workspace o admin. */
  canEdit: boolean;
  /** Ruta dentro del proyecto: path('/informe') → /p/marmota/informe */
  path: (p?: string) => string;
}

export const projectPath = (slug: string, p = '') => `/p/${slug}${p === '/' ? '' : p}`;

/** Proyectos que ve el usuario: los de sus workspaces (el admin los ve todos). */
export const getProjects = cache(async (): Promise<Project[]> => {
  const session = await getSession();
  if (!session) return [];
  let query = db().from('projects').select(PROJECT_COLUMNS).order('created_at');
  if (!session.isAdmin) query = query.in('workspace_id', session.workspaces.map((w) => w.id));
  return must(await query, 'projects') as Project[];
});

/** Proyectos del workspace con el que trabaja el usuario (para límites del plan y la barra lateral). */
export const getOwnProjects = cache(async (): Promise<Project[]> => {
  const session = await getSession();
  if (!session) return [];
  return (await getProjects()).filter((p) => p.workspace_id === session.workspace.id);
});

export const getCompetitors = cache(async (projectId: string): Promise<{ brand_id: string; paused_at: string | null }[]> => {
  return must(
    await db().from('project_competitors').select('brand_id, paused_at').eq('project_id', projectId),
    'project_competitors',
  ) as { brand_id: string; paused_at: string | null }[];
});

export const getCompetitorIds = cache(async (projectId: string): Promise<string[]> => (await getCompetitors(projectId)).map((r) => r.brand_id));

/** Contexto del proyecto de la URL. Responde 404 si el proyecto no existe. */
export const getProject = cache(async (slug: string): Promise<ProjectContext> => {
  const session = await getSession();
  // Sin acceso, 404 (no se desvela que el proyecto existe)
  const project = session && (await getProjects()).find((p) => p.slug === slug);
  if (!session || !project) notFound();
  const [all, sites, competitors] = await Promise.all([getAllBrands(), getSites(), getCompetitors(project.id)]);
  const competitorIds = competitors.map((c) => c.brand_id);
  const inProject = new Set([project.own_brand_id, ...competitorIds]);
  const workspace = session.workspaces.find((w) => w.id === project.workspace_id) ?? null;
  const brands = all
    .filter((b) => inProject.has(b.id))
    .map((b) => ({ ...b, is_own: b.id === project.own_brand_id }))
    .sort((a, b) => Number(b.is_own) - Number(a.is_own) || a.created_at.localeCompare(b.created_at));
  const projectSites = sites.filter((s) => inProject.has(s.brand_id));
  return {
    project,
    brands,
    sites: projectSites,
    siteIds: projectSites.map((s) => s.id),
    pausedBrandIds: new Set(competitors.filter((c) => c.paused_at).map((c) => c.brand_id)),
    workspace,
    session,
    canEdit: Boolean(workspace) || session.isAdmin,
    path: (p = '') => projectPath(project.slug, p),
  };
});
