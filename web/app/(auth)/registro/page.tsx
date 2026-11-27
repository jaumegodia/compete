import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell, GoogleButton, Notice, fieldClass, submitClass } from '@/components/auth-shell';
import { getUser } from '@/lib/auth';
import { getDict } from '@/lib/i18n';
import { signUp } from '../actions';

export const dynamic = 'force-dynamic';

export default async function Registro({ searchParams }: { searchParams: Promise<{ error?: string; email?: string }> }) {
  const [sp, { t }, user] = await Promise.all([searchParams, getDict(), getUser()]);
  if (user) redirect('/app');
  return (
    <AuthShell
      title={t.signupTitle}
      subtitle={t.signupSubtitle}
      footer={
        <>
          {t.haveAccount}{' '}
          <Link href="/login" className="font-medium text-accent hover:underline">
            {t.login}
          </Link>
        </>
      }
    >
      <Notice error={sp.error} />
      <GoogleButton t={t} next="/empezar" />
      <form action={signUp} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          {t.name}
          <input name="name" required autoComplete="name" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          {t.email}
          <input name="email" type="email" required autoComplete="email" defaultValue={sp.email} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          {t.password}
          <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder={t.passwordMin} className={fieldClass} />
        </label>
        <button className={submitClass}>{t.signup}</button>
        <p className="text-center text-xs text-ink-3">
          {t.acceptTerms}{' '}
          <Link href="/legal/terminos" className="underline">
            {t.terms}
          </Link>{' '}
          {t.and}{' '}
          <Link href="/legal/privacidad" className="underline">
            {t.privacy}
          </Link>
          .
        </p>
      </form>
    </AuthShell>
  );
}
