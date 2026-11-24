'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const NAV_GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: 'Vigilancia',
    items: [
      { href: '/', label: 'Resumen' },
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

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-5">
      {NAV_GROUPS.map((g) => (
        <div key={g.label}>
          <div className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-night-ink/50">{g.label}</div>
          <div className="flex flex-col gap-0.5">
            {g.items.map((n) => {
              const active = isActive(path, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
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

export function TopNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-2 text-sm">
      {NAV_GROUPS.flatMap((g) => g.items).map((n) => {
        const active = isActive(path, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`whitespace-nowrap rounded-full px-3 py-1 ${active ? 'bg-volt font-medium text-night' : 'text-night-ink'}`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
