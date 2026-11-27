import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell, GoogleButton, Notice, fieldClass, submitClass } from '@/components/auth-shell';
import { getUser } from '@/lib/auth';
import { getDict } from '@/lib/i18n';
import { safeNext } from '@/lib/site-url';
import { signIn } from '../actions';

export const dynamic = 'force-dynamic';

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; ok?: string; email?: string }> }) {
  const [sp, { t }, user] = await Promise.all([searchParams, getDict(), getUser()]);
  const next = safeNext(sp.next);
  if (user) redirect(next);
  return (
    <AuthShell
      title={t.loginTitle}
      footer={
        <>
          {t.noAccount}{' '}
          <Link href="/registro" className="font-medium text-accent hover:underline">
            {t.signup}
          </Link>
        </>
      }
    >
      <Notice ok={sp.ok} error={sp.error} />
      <GoogleButton t={t} next={next} />
      <form action={signIn} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          {t.email}
          <input name="email" type="email" required autoComplete="email" defaultValue={sp.email} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          {t.password}
          <input name="password" type="password" required autoComplete="current-password" className={fieldClass} />
        </label>
        <button className={submitClass}>{t.login}</button>
        <Link href="/recuperar" className="text-center text-xs text-ink-2 hover:underline">
          {t.forgot}
        </Link>
      </form>
    </AuthShell>
  );
}
