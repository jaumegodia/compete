import type Stripe from 'stripe';
import { stripe, syncSubscription } from '@/lib/stripe';

/**
 * Webhook de Stripe. Eventos que hay que activar en Stripe (Developers → Webhooks):
 * checkout.session.completed, customer.subscription.created, customer.subscription.updated,
 * customer.subscription.deleted. La firma se valida con STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return new Response('Stripe no configurado', { status: 503 });

  let event: Stripe.Event;
  try {
    event = await s.webhooks.constructEventAsync(await request.text(), request.headers.get('stripe-signature') ?? '', secret);
  } catch (e) {
    return new Response(`Firma no válida: ${(e as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const sub = await s.subscriptions.retrieve(typeof session.subscription === 'string' ? session.subscription : session.subscription.id);
          await syncSubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object);
        break;
    }
  } catch (e) {
    console.error(`Webhook ${event.type}: ${(e as Error).message}`);
    return new Response('Error al procesar el evento', { status: 500 });
  }
  return Response.json({ received: true });
}
