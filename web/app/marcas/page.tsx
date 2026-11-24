import Link from 'next/link';
import { Badge, BrandDot, Card, PageHeader, Table, buttonClass, inputClass, primaryButtonClass } from '@/components/ui';
import { brandColors, dateTime, num } from '@/lib/format';
import { canDispatch } from '@/lib/github';
import { getBrands, getCompetitorLinks, getSites } from '@/lib/queries';
import { addBrand, addSite, deleteBrand, linkCompetitor, runCapture, setSiteActive } from './actions';

export const dynamic = 'force-dynamic';

export default async function Marcas({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ ok, error }, brands, sites, links] = await Promise.all([searchParams, getBrands(), getSites(), getCompetitorLinks()]);
  const colors = brandColors(brands);
  const own = brands.filter((b) => b.is_own);
  const dispatch = canDispatch();
  const host = (url: string) => new URL(url).host.replace(/^www\./, '');

  return (
    <>
      <PageHeader
        title="Marcas y webs"
        subtitle="Tu marca y los competidores que se capturan cada día."
        actions={
          dispatch && (
            <form action={runCapture}>
              <button className={buttonClass}>Capturar todo ahora</button>
            </form>
          )
        }
      />

      {ok && <div className="mb-4 rounded-md border border-good-line bg-good-soft px-4 py-2.5 text-sm text-good">{ok}</div>}
      {error && <div className="mb-4 rounded-md border border-bad-line bg-bad-soft px-4 py-2.5 text-sm text-bad">{error}</div>}

      <div className="flex flex-col gap-4">
        {brands.map((b) => {
          const brandSites = sites.filter((s) => s.brand_id === b.id);
          const competitors = links.filter((l) => l.brand_id === b.id).map((l) => l.competitor_id);
          const competesWith = links.filter((l) => l.competitor_id === b.id).map((l) => l.brand_id);
          return (
            <Card
              key={b.id}
              title={
                <span className="inline-flex items-center gap-2">
                  <BrandDot color={colors[b.id]} />
                  <Link href={`/marcas/${b.id}`} className="hover:underline">
                    {b.name}
                  </Link>
                  {b.is_own ? <Badge tone="accent">Tu marca</Badge> : <Badge>Competidor</Badge>}
                </span>
              }
              right={<span className="text-xs text-ink-3">{num(b.products)} productos · {num(b.variants)} variantes</span>}
            >
              <Table>
                <thead>
                  <tr>
                    <th>Web</th>
                    <th>Plataforma</th>
                    <th>Última captura</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {brandSites.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <a href={s.base_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          {host(s.base_url)}
                        </a>
                      </td>
                      <td className="text-ink-2">{s.platform === 'auto' ? 'Por detectar / genérica' : s.platform}</td>
                      <td className="text-ink-2">{dateTime(s.last_scraped_at)}</td>
                      <td>{s.active ? <Badge tone="good">Activa</Badge> : <Badge>Pausada</Badge>}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          {dispatch && s.active && (
                            <form action={runCapture}>
                              <input type="hidden" name="site" value={host(s.base_url)} />
                              <button className={buttonClass}>Capturar</button>
                            </form>
                          )}
                          <form action={setSiteActive}>
                            <input type="hidden" name="site_id" value={s.id} />
                            <input type="hidden" name="active" value={String(!s.active)} />
                            <button className={buttonClass}>{s.active ? 'Pausar' : 'Reactivar'}</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              <div className="mt-4 grid gap-4 border-t border-line pt-4 text-sm md:grid-cols-2">
                <div>
                  {b.is_own ? (
                    <>
                      <div className="mb-2 text-xs font-medium text-ink-2">Competidores que se comparan con {b.name}</div>
                      <div className="flex flex-wrap gap-2">
                        {brands
                          .filter((c) => c.id !== b.id && !c.is_own)
                          .map((c) => {
                            const linked = competitors.includes(c.id);
                            return (
                              <form key={c.id} action={linkCompetitor}>
                                <input type="hidden" name="brand_id" value={b.id} />
                                <input type="hidden" name="competitor_id" value={c.id} />
                                <input type="hidden" name="linked" value={String(linked)} />
                                <button
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${linked ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-3'}`}
                                  title={linked ? 'Quitar de la comparación' : 'Añadir a la comparación'}
                                >
                                  <BrandDot color={colors[c.id]} />
                                  {c.name} {linked ? '✓' : '+'}
                                </button>
                              </form>
                            );
                          })}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-ink-2">
                      Compite con:{' '}
                      {competesWith.length ? competesWith.map((id) => brands.find((x) => x.id === id)?.name).join(', ') : 'ninguna marca propia'}
                    </div>
                  )}
                  <form action={addSite} className="mt-3 flex gap-2">
                    <input type="hidden" name="brand_id" value={b.id} />
                    <input name="url" placeholder="Otra web de la marca (p. ej. tienda.marca.com)" className={`${inputClass} flex-1`} />
                    <button className={buttonClass}>Añadir web</button>
                  </form>
                </div>
                <form action={deleteBrand} className="flex items-end justify-end gap-2">
                  <input type="hidden" name="brand_id" value={b.id} />
                  <input type="hidden" name="name" value={b.name} />
                  <input name="confirm" placeholder={`Escribe "${b.name}" para borrar`} className={`${inputClass} w-56`} />
                  <button className={`${buttonClass} text-bad`}>Borrar marca</button>
                </form>
              </div>
            </Card>
          );
        })}

        <Card title="Añadir una marca">
          <form action={addBrand} className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto_1fr_auto] md:items-end">
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Nombre
              <input name="name" required placeholder="Emma" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Web
              <input name="url" required placeholder="www.emma-colchon.es" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Tipo
              <select name="kind" defaultValue="competitor" className={inputClass}>
                <option value="competitor">Competidor</option>
                <option value="own">Marca propia</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Compite con (si es competidor)
              <select name="competitor_of" defaultValue={own[0]?.id ?? ''} className={inputClass}>
                <option value="">—</option>
                {own.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <button className={primaryButtonClass}>Añadir</button>
          </form>
          <p className="mt-3 text-xs text-ink-3">
            La plataforma se detecta sola (Shopify, WooCommerce o cualquier web con datos de producto). La primera captura fija el
            punto de partida; los cambios se registran a partir de la segunda.
            {!dispatch && ' Para lanzar capturas desde aquí, configura GITHUB_TOKEN en el servidor.'}
          </p>
        </Card>
      </div>
    </>
  );
}
