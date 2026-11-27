import { redirect } from 'next/navigation';
import { AuthShell, Notice, fieldClass, submitClass } from '@/components/auth-shell';
import { updatePassword } from '@/app/(auth)/actions';
import { getUser } from '@/lib/auth';
import { getDict } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** Llega aquí desde el enlace de recuperar contraseña (/auth/callback ya ha abierto la sesión). */
export default async function NuevaClave({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [sp, { t }, user] = await Promise.all([searchParams, getDict(), getUser()]);
  if (!user) redirect(`/login?error=${encodeURIComponent(t.errors.link)}`);
  return (
    <AuthShell title={t.newPasswordTitle}>
      <Notice error={sp.error} />
      <form action={updatePassword} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          {t.password}
          <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder={t.passwordMin} className={fieldClass} />
        </label>
        <button className={submitClass}>{t.save}</button>
      </form>
    </AuthShell>
  );
}
