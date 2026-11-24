import type { Metadata } from 'next';
import Link from 'next/link';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { Logo } from '@/components/logo';
import { SideNav, TopNav } from '@/components/nav';
import './globals.css';

export const metadata: Metadata = { title: 'COMPETE', description: 'Inteligencia competitiva para e-commerce' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <div className="flex min-h-screen">
          <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-night px-3 py-5 md:flex">
            <Link href="/" className="mb-8 block px-2">
              <Logo size={28} />
            </Link>
            <SideNav />
            <div className="mt-auto px-2.5 text-[11px] leading-relaxed text-night-ink/60">
              Inteligencia competitiva
              <br />
              para e-commerce
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            <header className="bg-night md:hidden">
              <Link href="/" className="block px-4 pb-2 pt-3">
                <Logo size={24} />
              </Link>
              <TopNav />
            </header>
            <main className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-10">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
