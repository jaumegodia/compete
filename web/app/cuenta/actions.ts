'use server';

import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { db, must } from '@/lib/db';
import { siteUrl } from '@/lib/site-url';
import { stripe } from '@/lib/stripe';

const fail = (message: string): never => redirect(`/cuenta?error=${encodeURIComponent(message)}`);

/** Cliente de Stripe del workspace (se crea la primera vez). */
async function customerFor(workspaceId: string, existing: string | null, email: string, name: string): Promise<string> {
  if (existing) return existing;
  const s = stripe()!;
  const customer = await s.customers.create({ email, name, metadata: { workspace_id: workspaceId } });
  must(await db().from('workspaces').update({ stripe_customer_id: customer.id }).eq('id', workspaceId), 'save customer');
  return customer.id;
}

/** Va a Stripe Checkout para suscribirse a un plan (mensual o anual). */
export async function startCheckout(form: FormData) {
  const session = await requireSession('/cuenta');
  const s = stripe();
  if (!s) fail('Los pagos todavía no están activados.');
  const ws = session.workspace;
  if (ws.role !== 'owner') fail('Solo el propietario de la cuenta puede cambiar el plan.');
  const planId = String(form.get('plan') ?? '');
  const yearly = form.get('interval') === 'year';
  const plan = must(await db().from('plans').select('*').eq('id', planId).eq('public', true).maybeSingle(), 'plan') as {
    stripe_price_monthly: string | null;
    stripe_price_yearly: string | null;
  } | null;
  const price = yearly ? plan?.stripe_price_yearly : plan?.stripe_price_monthly;
  if (!price) fail('Ese plan no está disponible.');
  const base = await siteUrl();

  // Con suscripción en vigor, el cambio de plan se hace en el portal (prorrateo incluido)
  if (ws.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(ws.subscription_status ?? '')) {
    const portal = await s!.billingPortal.sessions.create({ customer: ws.stripe_customer_id!, return_url: `${base}/cuenta` });
    redirect(portal.url);
  }

  const customer = await customerFor(ws.id, ws.stripe_customer_id, session.email, ws.name);
  const checkout = await s!.checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: ws.id,
    line_items: [{ price: price!, quantity: 1 }],
    subscription_data: { metadata: { workspace_id: ws.id } },
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    customer_update: { address: 'auto', name: 'auto' },
    success_url: `${base}/cuenta?ok=${encodeURIComponent('¡Gracias! Tu suscripción está activa.')}`,
    cancel_url: `${base}/cuenta`,
    locale: session.profile.locale === 'en' ? 'en' : 'es',
  });
  redirect(checkout.url!);
}

/** Portal de Stripe: cambiar de plan, tarjeta, facturas o cancelar. */
export async function openPortal() {
  const session = await requireSession('/cuenta');
  const s = stripe();
  const ws = session.workspace;
  if (!s || !ws.stripe_customer_id) fail('Todavía no tienes datos de facturación.');
  const portal = await s!.billingPortal.sessions.create({ customer: ws.stripe_customer_id!, return_url: `${await siteUrl()}/cuenta` });
  redirect(portal.url);
}
