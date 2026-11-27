import Link from 'next/link';
import { SiteChrome } from '@/components/site-chrome';
import { getUser } from '@/lib/auth';
import { getLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const T = {
  es: {
    kicker: 'Inteligencia competitiva para e-commerce',
    title: 'Sabe cada mañana qué ha cambiado en tu competencia',
    subtitle:
      'Precios, descuentos, productos nuevos, stock, promociones de la home, reseñas, anuncios y SEO de tus competidores. Capturado cada día y explicado en un informe que se lee en dos minutos.',
    cta: 'Empieza gratis 14 días',
    note: 'Sin tarjeta · Tu marca y 3 competidores · Cualquier tienda online',
    features: [
      ['Precios y catálogo', 'Cada producto y variante de tus competidores, con su precio, precio tachado y stock día a día. Altas, bajas y cambios detectados solos.'],
      ['Promociones de la home', 'El descuento que anuncian, sus códigos y campañas (Black Friday, rebajas…), aunque no tachen precios.'],
      ['Comparativa', 'Tu precio frente al de cada competidor en el mismo tipo de producto, del más barato al más caro.'],
      ['Reseñas', 'Nota y reseñas recientes de Trustpilot, para ver de un vistazo cómo les va.'],
      ['Publicidad', 'Qué anuncios tienen activos en Google (búsqueda, Shopping, YouTube) y a qué ritmo los lanzan.'],
      ['Tráfico y SEO', 'Visitas orgánicas estimadas, keywords que les traen tráfico y su evolución mes a mes.'],
    ],
    how: 'Cómo funciona',
    steps: ['Crea tu cuenta y añade tu web', 'Elige tus competidores (cualquier tienda: Shopify, WooCommerce, a medida…)', 'Recibe cada día los cambios en tu panel'],
  },
  en: {
    kicker: 'Competitive intelligence for e-commerce',
    title: 'Know every morning what changed at your competitors',
    subtitle:
      'Prices, discounts, new products, stock, homepage promotions, reviews, ads and SEO of your competitors. Captured daily and summarised in a two-minute report.',
    cta: 'Start your free 14-day trial',
    note: 'No card needed · Your brand and 3 competitors · Any online store',
    features: [
      ['Prices and catalogue', 'Every product and variant of your competitors, with price, strikethrough price and stock day by day. New, removed and changed items detected automatically.'],
      ['Homepage promotions', 'The discount they advertise, their codes and campaigns (Black Friday, sales…), even when they do not strike through prices.'],
      ['Price comparison', 'Your price against each competitor for the same product type, cheapest to most expensive.'],
      ['Reviews', 'Trustpilot rating and recent reviews, to see at a glance how they are doing.'],
      ['Advertising', 'Which Google ads they are running (search, Shopping, YouTube) and how fast they launch new ones.'],
      ['Traffic and SEO', 'Estimated organic visits, the keywords that bring them traffic and their monthly trend.'],
    ],
    how: 'How it works',
    steps: ['Create your account and add your website', 'Pick your competitors (any store: Shopify, WooCommerce, custom…)', 'Get the daily changes in your dashboard'],
  },
};

export default async function Landing() {
  const [locale, user] = await Promise.all([getLocale(), getUser()]);
  const t = T[locale];
  return (
    <SiteChrome locale={locale} loggedIn={Boolean(user)}>
      <section className="mx-auto max-w-4xl px-4 pb-16 pt-12 text-center md:pt-20">
        <div className="mb-4 text-xs font-medium uppercase tracking-[0.08em] text-accent">{t.kicker}</div>
        <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.035em] md:text-6xl">{t.title}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-2">{t.subtitle}</p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link href={user ? '/app' : '/registro'} className="rounded-md bg-night px-5 py-3 text-base font-medium text-white hover:bg-night-2">
            {t.cta}
          </Link>
          <span className="text-sm text-ink-3">{t.note}</span>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {t.features.map(([title, body]) => (
          <div key={title} className="rounded-lg border border-line bg-surface p-5 shadow-card">
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-1.5 text-sm text-ink-2">{body}</p>
          </div>
        ))}
      </section>

      <section className="bg-night py-14 text-white">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">{t.how}</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {t.steps.map((s, i) => (
              <li key={s} className="rounded-lg bg-night-2 p-5">
                <div className="num mb-2 text-2xl font-semibold text-volt">{i + 1}</div>
                <div className="text-sm text-night-ink">{s}</div>
              </li>
            ))}
          </ol>
          <Link href={user ? '/app' : '/registro'} className="mt-8 inline-block rounded-md bg-volt px-5 py-3 font-medium text-night hover:opacity-90">
            {t.cta}
          </Link>
        </div>
      </section>
    </SiteChrome>
  );
}
