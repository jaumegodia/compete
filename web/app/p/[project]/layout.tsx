import Link from 'next/link';
import { Logo } from '@/components/logo';
import { ProjectSwitcher, SideNav, TopNav } from '@/components/nav';
import { getProject, getProjects, projectPath } from '@/lib/project';

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const [{ project }, projects] = await Promise.all([getProject(slug), getProjects()]);
  const options = projects.map((p) => ({ slug: p.slug, name: p.name }));
  const home = projectPath(project.slug);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-night px-3 py-5 md:flex">
        <Link href={home} className="mb-6 block px-2">
          <Logo size={28} />
        </Link>
        <ProjectSwitcher projects={options} current={project.slug} />
        <SideNav base={home} />
        <div className="mt-auto px-2.5 text-[11px] leading-relaxed text-night-ink/60">
          Inteligencia competitiva
          <br />
          para e-commerce
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
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-10">{children}</main>
      </div>
    </div>
  );
}
