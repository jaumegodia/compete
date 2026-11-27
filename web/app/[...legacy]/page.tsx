import { notFound, redirect } from 'next/navigation';
import { getOwnProjects, getProjects, projectPath } from '@/lib/project';

export const dynamic = 'force-dynamic';

const SECTIONS = new Set(['informe', 'comparativa', 'promociones', 'trafico', 'resenas', 'publicidad', 'marcas', 'capturas', 'productos']);

/** Enlaces de antes de los proyectos (/informe, /marcas/…): llevan a la misma página del primer proyecto. */
export default async function Legacy({
  params,
  searchParams,
}: {
  params: Promise<{ legacy: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ legacy }, sp, own, all] = await Promise.all([params, searchParams, getOwnProjects(), getProjects()]);
  const projects = own.length ? own : all;
  if (!SECTIONS.has(legacy[0]) || !projects.length) notFound();
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of [v].flat()) if (x !== undefined) query.append(k, x);
  const qs = query.toString();
  redirect(`${projectPath(projects[0].slug, `/${legacy.map(encodeURIComponent).join('/')}`)}${qs ? `?${qs}` : ''}`);
}
