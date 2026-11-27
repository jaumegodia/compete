import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getOwnProjects, getProjects, projectPath } from '@/lib/project';

export const dynamic = 'force-dynamic';

/** Entrada al panel tras el login: el primer proyecto del usuario o, si no tiene, el alta guiada. */
export default async function AppHome() {
  const session = await requireSession('/app');
  const own = await getOwnProjects();
  if (own.length) redirect(projectPath(own[0].slug));
  const all = session.isAdmin ? await getProjects() : [];
  if (all.length) redirect(projectPath(all[0].slug));
  redirect('/empezar');
}
