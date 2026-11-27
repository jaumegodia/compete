import Link from 'next/link';
import type { ReactNode } from 'react';
import { signInWithGoogle } from '@/app/(auth)/actions';
import type { Dict } from '@/lib/i18n';
import { LogoMark } from './logo';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-2.5" aria-label="COMPETE">
        <LogoMark size={32} />
        <span className="text-xl font-semibold tracking-[-0.03em]">compete</span>
      </Link>
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-card">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
      {footer && <div className="mt-4 text-sm text-ink-2">{footer}</div>}
    </main>
  );
}

export function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <div className="mb-4 rounded-md border border-bad-line bg-bad-soft px-3 py-2 text-sm text-bad">{error}</div>;
  if (ok) return <div className="mb-4 rounded-md border border-good-line bg-good-soft px-3 py-2 text-sm text-good">{ok}</div>;
  return null;
}

/** Botón de Google (solo si el proveedor está configurado en Supabase: GOOGLE_AUTH_ENABLED=1). */
export function GoogleButton({ t, next }: { t: Dict; next?: string }) {
  if (process.env.GOOGLE_AUTH_ENABLED !== '1') return null;
  return (
    <>
      <form action={signInWithGoogle}>
        {next && <input type="hidden" name="next" value={next} />}
        <button className="flex w-full items-center justify-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium hover:bg-hover">
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          {t.continueGoogle}
        </button>
      </form>
      <div className="my-4 flex items-center gap-3 text-xs text-ink-3">
        <span className="h-px flex-1 bg-line" />
        {t.or}
        <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}

export const fieldClass =
  'w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring';
export const submitClass = 'w-full rounded-md bg-night px-3 py-2 text-sm font-medium text-white hover:bg-night-2';
