'use server';

import { redirect } from 'next/navigation';
import { getDict } from '@/lib/i18n';
import { safeNext, siteUrl } from '@/lib/site-url';
import { authClient } from '@/lib/supabase/server';

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const go = (path: string, params: Record<string, string>) => redirect(`${path}?${new URLSearchParams(params)}`);

export async function signIn(form: FormData) {
  const { t } = await getDict();
  const next = safeNext(field(form, 'next'));
  const supabase = await authClient();
  const { error } = await supabase.auth.signInWithPassword({ email: field(form, 'email'), password: String(form.get('password') ?? '') });
  if (error) {
    const msg = error.code === 'email_not_confirmed' ? t.errors.unconfirmed : error.code === 'invalid_credentials' ? t.errors.invalid : t.errors.generic;
    go('/login', { error: msg, next, email: field(form, 'email') });
  }
  redirect(next);
}

export async function signUp(form: FormData) {
  const { t, locale } = await getDict();
  const email = field(form, 'email');
  const password = String(form.get('password') ?? '');
  if (password.length < 8) go('/registro', { error: t.errors.weak, email });
  const supabase = await authClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await siteUrl()}/auth/callback?next=/empezar`,
      data: { full_name: field(form, 'name'), locale },
    },
  });
  if (error) go('/registro', { error: error.code === 'user_already_exists' ? t.errors.exists : error.code === 'weak_password' ? t.errors.weak : t.errors.generic, email });
  // Con confirmación de email activada no hay sesión todavía; sin ella, entra directamente
  if (data.session) redirect('/empezar');
  // Supabase devuelve un usuario sin identidades si el email ya existía (para no desvelarlo)
  if (data.user && data.user.identities?.length === 0) go('/registro', { error: t.errors.exists, email });
  go('/login', { ok: t.checkEmail, email });
}

export async function signInWithGoogle(form: FormData) {
  const next = safeNext(field(form, 'next'), '/empezar');
  const supabase = await authClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) {
    const { t } = await getDict();
    go('/login', { error: t.errors.generic });
  }
  redirect(data.url!);
}

export async function requestReset(form: FormData) {
  const { t } = await getDict();
  const supabase = await authClient();
  await supabase.auth.resetPasswordForEmail(field(form, 'email'), { redirectTo: `${await siteUrl()}/auth/callback?next=/auth/nueva-clave` });
  go('/recuperar', { ok: t.resetSent });
}

export async function updatePassword(form: FormData) {
  const { t } = await getDict();
  const password = String(form.get('password') ?? '');
  if (password.length < 8) go('/auth/nueva-clave', { error: t.errors.weak });
  const supabase = await authClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) go('/auth/nueva-clave', { error: error.code === 'same_password' ? error.message : t.errors.generic });
  redirect('/app');
}

export async function signOut() {
  const supabase = await authClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function setLanguage(form: FormData) {
  const { cookies } = await import('next/headers');
  const lang = field(form, 'lang') === 'en' ? 'en' : 'es';
  (await cookies()).set('lang', lang, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  redirect(safeNext(field(form, 'back'), '/'));
}
