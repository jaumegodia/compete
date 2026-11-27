import 'server-only';
import { notFound } from 'next/navigation';
import { cache } from 'react';
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
  created_at: string;
}

export interface ProjectContext {
  project: Project;
  /** Marcas del proyecto: la propia primero (con is_own = true) y luego las competidoras por orden de alta. */
  brands: BrandSummary[];
  /** Todas las webs de las marcas del proyecto (activas y pausadas). */
  sites: Site[];
  siteIds: string[];
  /** Ruta dentro del proyecto: path('/informe') → /p/marmota/informe */
  path: (p?: string) => string;
}

export const projectPath = (slug: string, p = '') => `/p/${slug}${p === '/' ? '' : p}`;

export const getProjects = cache(async (): Promise<Project[]> => {
  return must(await db().from('projects').select('id, slug, name, own_brand_id, created_at').order('created_at'), 'projects') as Project[];
});

export const getCompetitorIds = cache(async (projectId: string): Promise<string[]> => {
  const rows = must(
    await db().from('project_competitors').select('brand_id').eq('project_id', projectId),
    'project_competitors',
  ) as { brand_id: string }[];
  return rows.map((r) => r.brand_id);
});

/** Contexto del proyecto de la URL. Responde 404 si el proyecto no existe. */
export const getProject = cache(async (slug: string): Promise<ProjectContext> => {
  const project = (await getProjects()).find((p) => p.slug === slug);
  if (!project) notFound();
  const [all, sites, competitorIds] = await Promise.all([getAllBrands(), getSites(), getCompetitorIds(project.id)]);
  const inProject = new Set([project.own_brand_id, ...competitorIds]);
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
    path: (p = '') => projectPath(project.slug, p),
  };
});
