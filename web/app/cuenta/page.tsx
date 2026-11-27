import Link from 'next/link';
import { signOut } from '@/app/(auth)/actions';
import { Notice } from '@/components/auth-shell';
import { LogoMark } from '@/components/logo';
import { FEATURE_LABELS, PlanCards } from '@/components/plan-cards';
import { Card, buttonClass, primaryButtonClass } from '@/components/ui';
import { getPlans, requireSession } from '@/lib/auth';
import { getOwnProjects, projectPath } from '@/lib/project';
import { billingEnabled } from '@/lib/stripe';
import { openPortal, startCheckout } from './actions';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, string> = {
  active: 'Activa',
  trialing: 'En prueba',
  past_due: 'Pago pendiente',
  canceled: 'Cancelada',
  unpaid: 'Impagada',
  incomplete: 'Pago incompleto',
  incomplete_expired: 'Caducada',
  paused: 'Pausada',
};

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

export default async function Cuenta({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [session, sp, plans, own] = await Promise.all([requireSession('/cuenta'), searchParams, getPlans(), getOwnProjects()]);
  const ws = session.workspace;
  const billing = billingEnabled();
  const publicPlans = plans.filter((p) => p.public);
  const subscribed = Boolean(ws.stripe_subscription_id) && ws.subscription_status !== 'canceled';

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/app" className="inline-flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-lg font-semibold tracking-[-0.03em]">compete</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {own.length > 0 && (
            <Link href={projectPath(own[0].slug)} className="text-accent hover:underline">
              Ir al panel
            </Link>
          )}
          <form action={signOut}>
            <button className={buttonClass}>Salir</button>
          </form>
        </div>
      </div>

      <h1 className="text-[28px] font-semibold tracking-[-0.025em]">Cuenta</h1>
      <p className="mb-6 mt-1 text-sm text-ink-2">{session.email}</p>
      <Notice ok={sp.ok} error={sp.error} />

      {!ws.live && (
        <div className="mb-6 rounded-md border border-bad-line bg-bad-soft px-4 py-3 text-sm text-bad">
          {ws.plan_id === 'trial'
            ? 'Tu prueba de 14 días ha terminado. Elige un plan para seguir viendo tus datos; tu histórico se conserva.'
            : 'Tu suscripción no está activa. Elige un plan o actualiza el pago para seguir; tu histórico se conserva.'}
        </div>
      )}

      <Card title="Tu plan" className="mb-6">
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs text-ink-3">Plan</div>
            <div className="font-medium">{ws.plan.name}</div>
          </div>
          <div>
            <div className="text-xs text-ink-3">Estado</div>
            <div className="font-medium">
              {ws.plan_id === 'trial' ? (ws.live ? `Prueba: quedan ${ws.trial_days_left} días` : 'Prueba terminada') : ws.plan_id === 'internal' ? 'Interno' : (STATUS[ws.subscription_status ?? ''] ?? '—')}
            </div>
          </div>
          <div>
            <div className="text-xs text-ink-3">{ws.plan_id === 'trial' ? 'Fin de la prueba' : ws.cancel_at_period_end ? 'Se cancela el' : 'Próxima renovación'}</div>
            <div className="font-medium">{date(ws.plan_id === 'trial' ? ws.trial_ends_at : ws.current_period_end)}</div>
          </div>
        </div>
        <div className="mt-4 text-sm text-ink-2">
          {ws.plan.max_projects} proyecto{ws.plan.max_projects === 1 ? '' : 's'} · {ws.plan.max_competitors} competidores por proyecto ·{' '}
          {ws.plan.features.map((f) => FEATURE_LABELS[f]?.es ?? f).join(' · ')}
        </div>
        {billing && ws.stripe_customer_id && (
          <form action={openPortal} className="mt-4">
            <button className={buttonClass}>Facturas, tarjeta y cancelación</button>
          </form>
        )}
      </Card>

      {ws.plan_id !== 'internal' && ws.role === 'owner' && (
        <>
          <h2 className="mb-3 text-lg font-semibold">{subscribed ? 'Cambiar de plan' : 'Elige tu plan'}</h2>
          {!billing && <p className="mb-3 text-sm text-ink-3">Los pagos se activarán muy pronto.</p>}
          <PlanCards
            plans={publicPlans}
            locale="es"
            current={subscribed ? ws.plan_id : undefined}
            action={(p) =>
              billing && p.stripe_price_monthly ? (
                <div className="flex flex-col gap-2">
                  <form action={startCheckout}>
                    <input type="hidden" name="plan" value={p.id} />
                    <input type="hidden" name="interval" value="month" />
                    <button className={`${primaryButtonClass} w-full justify-center`} disabled={subscribed && ws.plan_id === p.id}>
                      Mensual
                    </button>
                  </form>
                  {p.stripe_price_yearly && (
                    <form action={startCheckout}>
                      <input type="hidden" name="plan" value={p.id} />
                      <input type="hidden" name="interval" value="year" />
                      <button className={`${buttonClass} w-full justify-center`}>Anual (2 meses gratis)</button>
                    </form>
                  )}
                </div>
              ) : (
                <button className={`${buttonClass} w-full justify-center`} disabled>
                  Próximamente
                </button>
              )
            }
          />
        </>
      )}
    </main>
  );
}
