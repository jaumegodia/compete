import Link from 'next/link';
import { AuthShell, Notice, fieldClass, submitClass } from '@/components/auth-shell';
import { getDict } from '@/lib/i18n';
import { requestReset } from '../actions';

export default async function Recuperar({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [sp, { t }] = await Promise.all([searchParams, getDict()]);
  return (
    <AuthShell
      title={t.resetTitle}
      footer={
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t.login}
        </Link>
      }
    >
      <Notice ok={sp.ok} error={sp.error} />
      <form action={requestReset} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          {t.email}
          <input name="email" type="email" required autoComplete="email" className={fieldClass} />
        </label>
        <button className={submitClass}>{t.resetSend}</button>
      </form>
    </AuthShell>
  );
}
