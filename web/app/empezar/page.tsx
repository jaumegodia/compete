import Link from 'next/link';
import { Notice, fieldClass, submitClass } from '@/components/auth-shell';
import { LogoMark } from '@/components/logo';
import { requireSession } from '@/lib/auth';
import { getLocale } from '@/lib/i18n';
import { COUNTRIES, VERTICALS } from '@/lib/markets';
import { getOwnProjects, projectPath } from '@/lib/project';
import { startProject } from './actions';

export const dynamic = 'force-dynamic';

const T = {
  es: {
    title: 'Configura tu primer proyecto',
    subtitle: 'Tu marca y los competidores con los que quieres compararte. En unos minutos empezamos a capturar sus webs.',
    brand: 'Tu marca',
    web: 'Tu web',
    country: 'Mercado',
    vertical: 'Sector',
    competitors: 'Competidores',
    competitorsHint: (n: number) => `Hasta ${n} con tu plan. Puedes añadir, pausar o cambiar competidores cuando quieras.`,
    cName: 'Nombre',
    cUrl: 'Web del competidor',
    submit: 'Crear proyecto y empezar a capturar',
    back: 'Volver a mis proyectos',
    after: 'La primera captura tarda de unos minutos a una hora según el tamaño de cada catálogo. Los cambios de precio y promociones se registran a partir del segundo día.',
  },
  en: {
    title: 'Set up your first project',
    subtitle: 'Your brand and the competitors you want to compare against. We start capturing their sites within minutes.',
    brand: 'Your brand',
    web: 'Your website',
    country: 'Market',
    vertical: 'Industry',
    competitors: 'Competitors',
    competitorsHint: (n: number) => `Up to ${n} on your plan. You can add, pause or change competitors at any time.`,
    cName: 'Name',
    cUrl: 'Competitor website',
    submit: 'Create project and start capturing',
    back: 'Back to my projects',
    after: 'The first capture takes from a few minutes to an hour depending on catalogue size. Price and promotion changes are tracked from day two.',
  },
};

export default async function Empezar({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [session, sp, locale, own] = await Promise.all([requireSession('/empezar'), searchParams, getLocale(), getOwnProjects()]);
  const t = T[locale];
  const max = session.isAdmin ? 10 : session.workspace.plan.max_competitors;
  const slots = Math.min(max, 6);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <span className="inline-flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-lg font-semibold tracking-[-0.03em]">compete</span>
        </span>
        {own.length > 0 && (
          <Link href={projectPath(own[0].slug)} className="text-sm text-accent hover:underline">
            {t.back}
          </Link>
        )}
      </div>
      <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em]">{t.title}</h1>
      <p className="mb-6 mt-1 text-sm text-ink-2">{t.subtitle}</p>
      <Notice error={sp.error} />

      <form action={startProject} className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-6 shadow-card">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
            {t.brand}
            <input name="name" required defaultValue={sp.name} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
            {t.web}
            <input name="url" required placeholder="www.tumarca.com" defaultValue={sp.url} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
            {t.country}
            <select name="country" defaultValue={sp.country ?? (locale === 'en' ? 'GB' : 'ES')} className={fieldClass}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c[locale]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
            {t.vertical}
            <select name="vertical" defaultValue={sp.vertical ?? ''} className={fieldClass}>
              <option value="">—</option>
              {VERTICALS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v[locale]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <div className="text-sm font-semibold">{t.competitors}</div>
          <p className="mb-3 text-xs text-ink-3">{t.competitorsHint(max)}</p>
          <div className="flex flex-col gap-2">
            {Array.from({ length: slots }, (_, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.6fr] gap-2">
                <input name={`c${i}_name`} placeholder={t.cName} defaultValue={sp[`c${i}_name`]} className={fieldClass} aria-label={`${t.cName} ${i + 1}`} />
                <input name={`c${i}_url`} placeholder={t.cUrl} defaultValue={sp[`c${i}_url`]} required={i === 0} className={fieldClass} aria-label={`${t.cUrl} ${i + 1}`} />
              </div>
            ))}
          </div>
        </div>

        <button className={submitClass}>{t.submit}</button>
        <p className="text-xs text-ink-3">{t.after}</p>
      </form>
    </main>
  );
}
