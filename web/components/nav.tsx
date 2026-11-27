'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export const NAV_GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: 'Vigilancia',
    items: [
      { href: '', label: 'Resumen' },
      { href: '/informe', label: 'Informe diario' },
      { href: '/comparativa', label: 'Comparativa' },
      { href: '/promociones', label: 'Promociones' },
    ],
  },
  {
    label: 'Mercado',
    items: [
      { href: '/trafico', label: 'Tráfico y SEO' },
      { href: '/resenas', label: 'Reseñas' },
      { href: '/publicidad', label: 'Publicidad' },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { href: '/marcas', label: 'Marcas y webs' },
      { href: '/capturas', label: 'Capturas' },
    ],
  },
];

/** Rutas de NAV_GROUPS relativas al proyecto (base = /p/<slug>). */
const isActive = (path: string, base: string, href: string) => {
  const full = base + href;
  return href === '' ? path === base : path === full || path.startsWith(`${full}/`);
};

/**
 * Selector de proyecto (mercado). Al cambiar, se queda en la misma sección del otro proyecto; desde
 * una ficha de marca o de producto vuelve a la lista, porque esa ficha no existe en el otro proyecto.
 */
export function ProjectSwitcher({
  projects,
  current,
  compact = false,
}: {
  projects: { slug: string; name: string }[];
  current: string;
  compact?: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const section = path.split('/')[3] ?? '';
  const go = (slug: string) => {
    if (slug === '__new') return router.push(`/p/${current}/marcas#nuevo-proyecto`);
    const keep = section && section !== 'productos' ? `/${section}` : '';
    router.push(`/p/${slug}${keep}`);
  };
  return (
    <label className={compact ? 'block' : 'mb-6 block px-1'}>
      {!compact && <span className="mb-1.5 block px-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-night-ink/60">Proyecto</span>}
      <select
        value={current}
        onChange={(e) => go(e.target.value)}
        aria-label="Proyecto"
        className={`w-full rounded-md border border-night-2 bg-night-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-volt ${
          compact ? 'max-w-44 px-2 py-1 text-xs' : 'px-2.5 py-2 text-sm font-medium'
        }`}
      >
        {projects.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name}
          </option>
        ))}
        <option value="__new">+ Nuevo proyecto…</option>
      </select>
    </label>
  );
}

export function SideNav({ base }: { base: string }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-5">
      {NAV_GROUPS.map((g) => (
        <div key={g.label}>
          <div className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-night-ink/60">{g.label}</div>
          <div className="flex flex-col gap-0.5">
            {g.items.map((n) => {
              const active = isActive(path, base, n.href);
              return (
                <Link
                  key={n.href}
                  href={base + n.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                    active ? 'bg-night-2 font-medium text-white' : 'text-night-ink hover:bg-night-2/70 hover:text-white'
                  }`}
                >
                  {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-volt" aria-hidden />}
                  {n.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function TopNav({ base }: { base: string }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-2 text-sm">
      {NAV_GROUPS.flatMap((g) => g.items).map((n) => {
        const active = isActive(path, base, n.href);
        return (
          <Link
            key={n.href}
            href={base + n.href}
            className={`whitespace-nowrap rounded-full px-3 py-1 ${active ? 'bg-volt font-medium text-night' : 'text-night-ink'}`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
