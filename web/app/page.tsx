import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui';
import { getProjects, projectPath } from '@/lib/project';
import { NewProjectForm } from './p/[project]/marcas/new-project-form';

export const dynamic = 'force-dynamic';

/** Entra en el primer proyecto. Sin proyectos, pide crear el primero. */
export default async function Root({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [projects, { error }] = await Promise.all([getProjects(), searchParams]);
  if (projects.length) redirect(projectPath(projects[0].slug));
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title="Crea tu primer proyecto" subtitle="Un proyecto es tu marca y los competidores con los que se compara." />
      {error && <div className="mb-4 rounded-md border border-bad-line bg-bad-soft px-4 py-2.5 text-sm text-bad">{error}</div>}
      <Card>
        <NewProjectForm />
      </Card>
    </main>
  );
}
