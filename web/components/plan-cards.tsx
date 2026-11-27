import type { ReactNode } from 'react';
import type { Plan } from '@/lib/auth';

export const FEATURE_LABELS: Record<string, { es: string; en: string }> = {
  catalog: { es: 'Catálogo, precios y stock diarios', en: 'Daily catalogue, prices and stock' },
  promos: { es: 'Promociones de la home', en: 'Homepage promotions' },
  reviews: { es: 'Reseñas de Trustpilot', en: 'Trustpilot reviews' },
  ads: { es: 'Anuncios de Google', en: 'Google ads' },
  seo: { es: 'Tráfico y SEO', en: 'Traffic and SEO' },
  alerts: { es: 'Alertas por email', en: 'Email alerts' },
};

const eur = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`;

/** Tarjetas de planes. `action(plan)` pinta el botón de cada plan (registro en la web pública, Checkout en Cuenta). */
export function PlanCards({ plans, locale, current, action }: { plans: Plan[]; locale: 'es' | 'en'; current?: string; action: (plan: Plan) => ReactNode }) {
  const t =
    locale === 'en'
      ? { month: '/month', vat: 'excl. VAT', year: (n: number) => `or ${eur(n)}/year (2 months free)`, projects: (n: number) => `${n} project${n === 1 ? '' : 's'}`, comps: (n: number) => `${n} competitors per project`, current: 'Your plan' }
      : { month: '/mes', vat: 'sin IVA', year: (n: number) => `o ${eur(n)}/año (2 meses gratis)`, projects: (n: number) => `${n} proyecto${n === 1 ? '' : 's'}`, comps: (n: number) => `${n} competidores por proyecto`, current: 'Tu plan' };
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {plans.map((p) => (
        <div key={p.id} className={`flex flex-col rounded-lg border bg-surface p-5 shadow-card ${current === p.id ? 'border-accent ring-2 ring-accent-ring' : 'border-line'}`}>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">{p.name}</h3>
            {current === p.id && <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">{t.current}</span>}
          </div>
          <div className="mt-2">
            <span className="num text-3xl font-semibold tracking-[-0.02em]">{eur(p.monthly_eur ?? 0)}</span>
            <span className="text-sm text-ink-2">{t.month}</span>
            <span className="ml-1 text-xs text-ink-3">{t.vat}</span>
          </div>
          {p.yearly_eur && <div className="text-xs text-ink-3">{t.year(p.yearly_eur)}</div>}
          <ul className="mt-4 flex flex-1 flex-col gap-1.5 text-sm text-ink-2">
            <li>✓ {t.projects(p.max_projects)}</li>
            <li>✓ {t.comps(p.max_competitors)}</li>
            {p.features.map((f) => (
              <li key={f}>✓ {FEATURE_LABELS[f]?.[locale] ?? f}</li>
            ))}
          </ul>
          <div className="mt-5">{action(p)}</div>
        </div>
      ))}
    </div>
  );
}
