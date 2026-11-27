import 'server-only';
import Stripe from 'stripe';
import { db, must } from './db';

let client: Stripe | null = null;

/** Cliente de Stripe (STRIPE_SECRET_KEY: sk_test_… en pruebas). null si los pagos no están configurados. */
export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key);
  return client;
}

export const billingEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

/** Plan que corresponde a un precio de Stripe (plans.stripe_price_monthly / _yearly). */
export async function planForPrice(priceId: string): Promise<string | null> {
  const rows = must(
    await db().from('plans').select('id').or(`stripe_price_monthly.eq.${priceId},stripe_price_yearly.eq.${priceId}`).limit(1),
    'plan by price',
  ) as { id: string }[];
  return rows[0]?.id ?? null;
}

/** Copia el estado de una suscripción de Stripe en su workspace. */
export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const workspaceId = sub.metadata?.workspace_id;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const item = sub.items.data[0];
  const planId = item ? await planForPrice(item.price.id) : null;
  // Desde la API 2025-03 el fin de periodo va en cada línea de la suscripción
  const periodEnd = (item as unknown as { current_period_end?: number })?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  const update: Record<string, unknown> = {
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  };
  if (planId) update.plan_id = planId;
  const query = db().from('workspaces').update(update);
  must(await (workspaceId ? query.eq('id', workspaceId) : query.eq('stripe_customer_id', customerId)), 'sync subscription');
}
