import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { db, must } from './db';
import { authClient } from './supabase/server';

export interface Profile {
  user_id: string;
  email: string | null;
  full_name: string | null;
  locale: 'es' | 'en';
  is_admin: boolean;
}

export interface Plan {
  id: string;
  name: string;
  max_projects: number;
  max_competitors: number;
  features: string[];
  monthly_eur: number | null;
  yearly_eur: number | null;
  stripe_price_monthly: string | null;
  stripe_price_yearly: string | null;
  public: boolean;
  sort: number;
}

export interface Workspace {
  id: string;
  name: string;
  plan_id: string;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  role: 'owner' | 'member';
  plan: Plan;
  /** Puede usar el producto: plan interno, suscripción en vigor o prueba sin caducar (= workspace_is_live en SQL). */
  live: boolean;
  /** Días de prueba que quedan (null si no está en prueba). */
  trial_days_left: number | null;
}

export interface Session {
  userId: string;
  email: string;
  profile: Profile;
  workspaces: Workspace[];
  /** Workspace con el que trabaja: el primero del que es owner. */
  workspace: Workspace;
  isAdmin: boolean;
}

export const getPlans = cache(async (): Promise<Plan[]> => {
  const rows = must(await db().from('plans').select('*').order('sort'), 'plans') as Plan[];
  return rows.map((p) => ({ ...p, monthly_eur: p.monthly_eur === null ? null : Number(p.monthly_eur), yearly_eur: p.yearly_eur === null ? null : Number(p.yearly_eur) }));
});

export function isLive(w: Pick<Workspace, 'plan_id' | 'subscription_status' | 'trial_ends_at'>): boolean {
  return (
    w.plan_id === 'internal' ||
    ['active', 'trialing', 'past_due'].includes(w.subscription_status ?? '') ||
    (w.plan_id === 'trial' && !!w.trial_ends_at && new Date(w.trial_ends_at).getTime() > Date.now())
  );
}

/** Usuario con sesión (o null). La sesión se valida con Supabase en cada petición. */
export const getUser = cache(async () => {
  const supabase = await authClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getSession = cache(async (): Promise<Session | null> => {
  const user = await getUser();
  if (!user) return null;
  const [profileRes, membersRes, plans] = await Promise.all([
    db().from('profiles').select('user_id, email, full_name, locale, is_admin').eq('user_id', user.id).maybeSingle(),
    db().from('workspace_members').select('role, workspace:workspaces(*)').eq('user_id', user.id).order('created_at'),
    getPlans(),
  ]);
  let profile = must(profileRes, 'profile') as Profile | null;
  let members = must(membersRes, 'workspace_members') as unknown as { role: Workspace['role']; workspace: Omit<Workspace, 'role' | 'plan' | 'live' | 'trial_days_left'> }[];
  if (!profile || !members.length) {
    // Usuario creado antes del disparador de alta (o si falló): se le crea perfil y workspace ahora
    await ensureAccount(user.id, user.email ?? '', (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || '');
    profile = must(await db().from('profiles').select('user_id, email, full_name, locale, is_admin').eq('user_id', user.id).single(), 'profile') as Profile;
    members = must(await db().from('workspace_members').select('role, workspace:workspaces(*)').eq('user_id', user.id).order('created_at'), 'workspace_members') as unknown as typeof members;
  }
  const byId = new Map(plans.map((p) => [p.id, p]));
  const workspaces: Workspace[] = members.map(({ role, workspace: w }) => {
    const trialLeft = w.plan_id === 'trial' && w.trial_ends_at ? Math.max(0, Math.ceil((new Date(w.trial_ends_at).getTime() - Date.now()) / 86400000)) : null;
    return { ...w, role, plan: byId.get(w.plan_id)!, live: isLive(w), trial_days_left: trialLeft };
  });
  const workspace = workspaces.find((w) => w.role === 'owner') ?? workspaces[0];
  return { userId: user.id, email: user.email ?? '', profile, workspaces, workspace, isAdmin: profile.is_admin };
});

/** Sesión obligatoria: sin ella, a /login. */
export async function requireSession(next?: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  return session;
}

async function ensureAccount(userId: string, email: string, name: string) {
  const display = name || email.split('@')[0] || 'Mi empresa';
  await db().from('profiles').upsert({ user_id: userId, email, full_name: display }, { onConflict: 'user_id', ignoreDuplicates: true });
  const has = must(await db().from('workspace_members').select('workspace_id').eq('user_id', userId).limit(1), 'members') as unknown[];
  if (has.length) return;
  const ws = must(await db().from('workspaces').insert({ name: display }).select('id').single(), 'workspace') as { id: string };
  must(await db().from('workspace_members').insert({ workspace_id: ws.id, user_id: userId, role: 'owner' }), 'member');
}
