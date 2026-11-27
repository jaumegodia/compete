import Link from 'next/link';
import { PlanCards } from '@/components/plan-cards';
import { SiteChrome } from '@/components/site-chrome';
import { getPlans, getUser } from '@/lib/auth';
import { getLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function Precios() {
  const [locale, user, plans] = await Promise.all([getLocale(), getUser(), getPlans()]);
  const t =
    locale === 'en'
      ? { title: 'Simple pricing', subtitle: 'Start with a free 14-day trial, no card needed. Then pick the plan that fits.', cta: 'Start free trial', faq: 'All plans are billed monthly or yearly and can be cancelled at any time. Prices exclude VAT.' }
      : { title: 'Precios claros', subtitle: 'Empieza con 14 días gratis, sin tarjeta. Después, elige el plan que te encaje.', cta: 'Empezar gratis', faq: 'Todos los planes se pagan al mes o al año y se cancelan cuando quieras. Precios sin IVA.' };
  return (
    <SiteChrome locale={locale} loggedIn={Boolean(user)} back="/precios">
      <section className="mx-auto max-w-5xl px-4 pb-16 pt-10">
        <h1 className="text-center text-4xl font-semibold tracking-[-0.03em]">{t.title}</h1>
        <p className="mx-auto mb-10 mt-3 max-w-xl text-center text-ink-2">{t.subtitle}</p>
        <PlanCards
          plans={plans.filter((p) => p.public)}
          locale={locale}
          action={() => (
            <Link href={user ? '/cuenta' : '/registro'} className="block rounded-md bg-night px-3 py-2 text-center text-sm font-medium text-white hover:bg-night-2">
              {t.cta}
            </Link>
          )}
        />
        <p className="mt-6 text-center text-sm text-ink-3">{t.faq}</p>
      </section>
    </SiteChrome>
  );
}
