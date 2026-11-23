import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = { title: 'COMPETE', description: 'Inteligencia competitiva para e-commerce' };

const NAV = [
  { href: '/', label: 'Resumen' },
  { href: '/informe', label: 'Informe diario' },
  { href: '/comparativa', label: 'Comparativa' },
  { href: '/promociones', label: 'Promociones' },
  { href: '/trafico', label: 'Tráfico y SEO' },
  { href: '/resenas', label: 'Reseñas' },
  { href: '/publicidad', label: 'Publicidad' },
  { href: '/marcas', label: 'Marcas y webs' },
  { href: '/capturas', label: 'Capturas' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen">
          <aside className="hidden w-52 shrink-0 border-r border-line bg-surface px-3 py-5 md:block">
            <Link href="/" className="mb-6 block px-2 text-base font-bold tracking-tight">
              COMPETE
            </Link>
            <nav className="flex flex-col gap-0.5">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-2 py-1.5 text-sm text-ink-2 hover:bg-[#f1f0ec] hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </nav>
          </aside>
          <div className="min-w-0 flex-1">
            <nav className="flex gap-3 overflow-x-auto border-b border-line bg-surface px-4 py-2 text-sm md:hidden">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="whitespace-nowrap text-ink-2">
                  {n.label}
                </Link>
              ))}
            </nav>
            <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
