import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOut } from '@/app/(auth)/actions';
import { Logo } from '@/components/logo';
import { ProjectSwitcher, SideNav, TopNav } from '@/components/nav';
import { getProject, getProjects, projectPath } from '@/lib/project';

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const [{ project, workspace, session }, projects] = await Promise.all([getProject(slug), getProjects()]);
  // Prueba caducada o suscripción sin pagar: a Cuenta (el admin entra siempre)
  if (workspace && !workspace.live && !session.isAdmin) redirect('/cuenta');
  const options = projects.map((p) => ({ slug: p.slug, name: p.name }));
  const home = projectPath(project.slug);
  const trialLeft = workspace?.trial_days_left;

  const account = (
    <div className="flex items-center gap-3 text-[12px]">
      <Link href="/cuenta" className="text-night-ink hover:text-white">
        Cuenta
      </Link>
      <form action={signOut}>
        <button className="text-night-ink hover:text-white">Salir</button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-night px-3 py-5 md:flex">
        <Link href={home} className="mb-6 block px-2">
          <Logo size={28} />
        </Link>
        <ProjectSwitcher projects={options} current={project.slug} />
        <SideNav base={home} />
        <div className="mt-auto flex flex-col gap-2 px-2.5">
          <div className="truncate text-[11px] text-night-ink/60" title={session.email}>
            {session.email}
            {session.isAdmin && ' · admin'}
          </div>
          {account}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="bg-night md:hidden">
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
            <Link href={home} className="block">
              <Logo size={24} />
            </Link>
            <ProjectSwitcher projects={options} current={project.slug} compact />
          </div>
          <TopNav base={home} />
        </header>
        {trialLeft !== null && trialLeft !== undefined && (
          <div className="border-b border-line bg-accent-soft px-4 py-2 text-center text-sm text-ink-2 md:px-10">
            Prueba gratuita: {trialLeft === 0 ? 'último día' : `quedan ${trialLeft} día${trialLeft === 1 ? '' : 's'}`}.{' '}
            <Link href="/cuenta" className="font-medium text-accent hover:underline">
              Elegir plan
            </Link>
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-10">{children}</main>
        <div className="bg-night px-4 py-3 md:hidden">{account}</div>
      </div>
    </div>
  );
}
