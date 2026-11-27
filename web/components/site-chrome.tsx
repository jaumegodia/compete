import Link from 'next/link';
import type { ReactNode } from 'react';
import { setLanguage } from '@/app/(auth)/actions';
import type { Locale } from '@/lib/i18n';
import { LogoMark } from './logo';

/** Cabecera y pie de la web pública (landing, precios, legales). */
export function SiteChrome({ children, locale, loggedIn, back = '/' }: { children: ReactNode; locale: Locale; loggedIn: boolean; back?: string }) {
  const t =
    locale === 'en'
      ? { pricing: 'Pricing', login: 'Log in', start: 'Start free trial', panel: 'Go to dashboard', legal: 'Legal notice', privacy: 'Privacy', terms: 'Terms', cookies: 'Cookies' }
      : { pricing: 'Precios', login: 'Entrar', start: 'Prueba gratis', panel: 'Ir al panel', legal: 'Aviso legal', privacy: 'Privacidad', terms: 'Términos', cookies: 'Cookies' };
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label="COMPETE">
          <LogoMark size={30} />
          <span className="text-lg font-semibold tracking-[-0.03em]">compete</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/precios" className="text-ink-2 hover:text-ink">
            {t.pricing}
          </Link>
          {loggedIn ? (
            <Link href="/app" className="rounded-md bg-night px-3 py-1.5 font-medium text-white hover:bg-night-2">
              {t.panel}
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-ink-2 hover:text-ink">
                {t.login}
              </Link>
              <Link href="/registro" className="rounded-md bg-night px-3 py-1.5 font-medium text-white hover:bg-night-2">
                {t.start}
              </Link>
            </>
          )}
        </nav>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-ink-3">
          <span>© {new Date().getFullYear()} COMPETE</span>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/legal/aviso-legal">{t.legal}</Link>
            <Link href="/legal/privacidad">{t.privacy}</Link>
            <Link href="/legal/terminos">{t.terms}</Link>
            <Link href="/legal/cookies">{t.cookies}</Link>
            <form action={setLanguage} className="flex gap-1">
              <input type="hidden" name="back" value={back} />
              <button name="lang" value="es" className={locale === 'es' ? 'font-semibold text-ink' : ''}>ES</button>
              <span>·</span>
              <button name="lang" value="en" className={locale === 'en' ? 'font-semibold text-ink' : ''}>EN</button>
            </form>
          </div>
        </div>
      </footer>
    </div>
  );
}
