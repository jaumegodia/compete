import { notFound } from 'next/navigation';
import { SiteChrome } from '@/components/site-chrome';
import { getUser } from '@/lib/auth';
import { getLocale } from '@/lib/i18n';
import { DOCS, OWNER } from '@/lib/legal';

export const dynamic = 'force-dynamic';

export default async function Legal({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = DOCS[doc];
  if (!d) notFound();
  const [locale, user] = await Promise.all([getLocale(), getUser()]);
  return (
    <SiteChrome locale={locale} loggedIn={Boolean(user)} back={`/legal/${doc}`}>
      <article className="mx-auto max-w-3xl px-4 pb-16 pt-8">
        <h1 className="text-3xl font-semibold tracking-[-0.025em]">{d.title}</h1>
        <p className="mt-1 text-sm text-ink-3">Última actualización: {OWNER.updated}</p>
        {locale === 'en' && <p className="mt-3 text-sm text-ink-2">This document is currently available in Spanish only.</p>}
        {d.sections.map(([h, ps]) => (
          <section key={h} className="mt-8">
            <h2 className="text-lg font-semibold">{h}</h2>
            {ps.map((p) => (
              <p key={p.slice(0, 40)} className="mt-2 text-[15px] leading-relaxed text-ink-2">
                {p}
              </p>
            ))}
          </section>
        ))}
      </article>
    </SiteChrome>
  );
}
