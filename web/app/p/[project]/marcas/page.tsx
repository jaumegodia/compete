import Link from 'next/link';
import { Badge, BrandDot, Card, PageHeader, Table, buttonClass, inputClass, primaryButtonClass } from '@/components/ui';
import { brandColors, dateTime, num } from '@/lib/format';
import { canDispatch } from '@/lib/github';
import { getProject } from '@/lib/project';
import { getAllBrands } from '@/lib/queries';
import { addBrand, addSite, deleteBrand, deleteProject, runCapture, setCompetitorPaused, setProjectPaused, setSiteActive, toggleCompetitor } from './actions';
import { NewProjectForm } from './new-project-form';

export const dynamic = 'force-dynamic';

export default async function Marcas({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const [{ project: slug }, { ok, error }] = await Promise.all([params, searchParams]);
  const [{ project, brands, sites, path, pausedBrandIds, session, workspace }, allBrands] = await Promise.all([getProject(slug), getAllBrands()]);
  const admin = session.isAdmin;
  const plan = workspace?.plan;
  const activeCompetitors = brands.filter((b) => !b.is_own && !pausedBrandIds.has(b.id)).length;
  const colors = brandColors(brands);
  const own = brands.find((b) => b.is_own);
  const inProject = new Set(brands.map((b) => b.id));
  // Marcas dadas de alta en otros proyectos que se pueden añadir aquí (ya tienen histórico). Solo admin:
  // a un cliente no se le enseña qué siguen los demás.
  const available = admin ? allBrands.filter((b) => !inProject.has(b.id)) : [];
  const dispatch = canDispatch();
  const projectField = <input type="hidden" name="project" value={project.slug} />;
  const host = (url: string) => new URL(url).host.replace(/^www\./, '');

  return (
    <>
      <PageHeader
        title="Marcas y webs"
        subtitle={`Proyecto ${project.name}: tu marca y los competidores con los que se compara. Las webs se capturan cada día.`}
        actions={
          dispatch && admin && (
            <form action={runCapture}>
              {projectField}
              <button className={buttonClass}>Capturar todo ahora</button>
            </form>
          )
        }
      />

      {ok && <div className="mb-4 rounded-md border border-good-line bg-good-soft px-4 py-2.5 text-sm text-good">{ok}</div>}
      {error && <div className="mb-4 rounded-md border border-bad-line bg-bad-soft px-4 py-2.5 text-sm text-bad">{error}</div>}

      {project.paused_at && (
        <div className="mb-4 rounded-md border border-line bg-warn-soft px-4 py-2.5 text-sm text-warn">
          Este proyecto está pausado: no se captura nada para él. Reanúdalo al final de la página.
        </div>
      )}
      {plan && (
        <p className="mb-4 text-sm text-ink-2">
          Plan {plan.name}: {activeCompetitors} de {plan.max_competitors} competidores activos.
          {activeCompetitors >= plan.max_competitors && !admin && ' Pausa uno para añadir otro, o cambia de plan en Cuenta.'}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {brands.map((b) => {
          const brandSites = sites.filter((s) => s.brand_id === b.id);
          const paused = pausedBrandIds.has(b.id);
          return (
            <Card
              key={b.id}
              title={
                <span className="inline-flex items-center gap-2">
                  <BrandDot color={colors[b.id]} />
                  <Link href={path(`/marcas/${b.id}`)} className="hover:underline">
                    {b.name}
                  </Link>
                  {b.is_own ? <Badge tone="accent">Tu marca</Badge> : <Badge>Competidor</Badge>}
                  {paused && <Badge tone="warn">Pausado</Badge>}
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
                      <td>{!s.active ? <Badge>Desactivada</Badge> : paused || project.paused_at ? <Badge tone="warn">Pausada aquí</Badge> : <Badge tone="good">Activa</Badge>}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          {dispatch && s.active && !paused && (
                            <form action={runCapture}>
                              {projectField}
                              <input type="hidden" name="site" value={host(s.base_url)} />
                              <button className={buttonClass}>Capturar</button>
                            </form>
                          )}
                          {admin && (
                            <form action={setSiteActive}>
                              {projectField}
                              <input type="hidden" name="site_id" value={s.id} />
                              <input type="hidden" name="active" value={String(!s.active)} />
                              <button className={buttonClass} title="Interruptor global: afecta a todos los proyectos y clientes">
                                {s.active ? 'Desactivar (global)' : 'Activar (global)'}
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              <div className="mt-4 grid gap-4 border-t border-line pt-4 text-sm md:grid-cols-2">
                <form action={addSite} className="flex gap-2">
                  {projectField}
                  <input type="hidden" name="brand_id" value={b.id} />
                  <input name="url" placeholder="Otra web de la marca (p. ej. tienda.marca.com)" className={`${inputClass} flex-1`} />
                  <button className={buttonClass}>Añadir web</button>
                </form>
                {!b.is_own && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <form action={setCompetitorPaused}>
                      {projectField}
                      <input type="hidden" name="brand_id" value={b.id} />
                      <input type="hidden" name="paused" value={String(!paused)} />
                      <button className={buttonClass} title={paused ? 'Vuelve a capturarse para este proyecto' : 'Deja de capturarse para este proyecto (otros proyectos no se ven afectados); su histórico se conserva'}>
                        {paused ? 'Reanudar' : 'Pausar'}
                      </button>
                    </form>
                    <form action={toggleCompetitor}>
                      {projectField}
                      <input type="hidden" name="brand_id" value={b.id} />
                      <input type="hidden" name="linked" value="true" />
                      <button className={buttonClass} title="Deja de compararse en este proyecto; sus datos se conservan">
                        Quitar del proyecto
                      </button>
                    </form>
                    {admin && <form action={deleteBrand} className="flex gap-2">
                      {projectField}
                      <input type="hidden" name="brand_id" value={b.id} />
                      <input type="hidden" name="name" value={b.name} />
                      <input name="confirm" placeholder={`Escribe "${b.name}" para borrar`} className={`${inputClass} w-48`} />
                      <button className={`${buttonClass} text-bad`}>Borrar marca</button>
                    </form>}
                  </div>
                )}
              </div>
            </Card>
          );
        })}

        <Card title={`Añadir un competidor de ${own?.name ?? project.name}`}>
          <form action={addBrand} className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
            {projectField}
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Nombre
              <input name="name" required placeholder="Competidor" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              Web
              <input name="url" required placeholder="www.competidor.com" className={inputClass} />
            </label>
            <button className={primaryButtonClass}>Añadir</button>
          </form>
          {available.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <div className="mb-2 text-xs font-medium text-ink-2">O añade una marca que ya se captura en otro proyecto (con todo su histórico)</div>
              <div className="flex flex-wrap gap-2">
                {available.map((c) => (
                  <form key={c.id} action={toggleCompetitor}>
                    {projectField}
                    <input type="hidden" name="brand_id" value={c.id} />
                    <input type="hidden" name="linked" value="false" />
                    <button className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 hover:border-accent hover:text-ink">
                      {c.name} +
                    </button>
                  </form>
                ))}
              </div>
            </div>
          )}
          <p className="mt-3 text-xs text-ink-3">
            La plataforma se detecta sola (Shopify, WooCommerce o cualquier web con datos de producto). La primera captura fija el
            punto de partida; los cambios se registran a partir de la segunda. Si ya teníamos histórico de la web, lo verás desde el
            primer día.
            {!dispatch && admin && ' Para lanzar capturas desde aquí, configura GITHUB_TOKEN en el servidor.'}
          </p>
        </Card>

        <Card title="Nuevo proyecto">
          <div id="nuevo-proyecto" className="scroll-mt-6" />
          <p className="mb-3 text-sm text-ink-2">
            Otro mercado con su propia marca y competidores (p. ej. otro cliente). Cada proyecto se ve por separado con el selector
            de la barra lateral.
          </p>
          <NewProjectForm from={path('/marcas')} />
        </Card>

        <Card title={project.paused_at ? 'Reanudar este proyecto' : 'Pausar este proyecto'}>
          <form action={setProjectPaused} className="flex flex-wrap items-center justify-between gap-3">
            {projectField}
            <input type="hidden" name="paused" value={String(!project.paused_at)} />
            <p className="text-sm text-ink-2">
              {project.paused_at ? 'Vuelve a capturar tu marca y tus competidores cada día.' : 'Deja de capturar todo el proyecto sin perder el histórico.'}
            </p>
            <button className={buttonClass}>{project.paused_at ? 'Reanudar proyecto' : 'Pausar proyecto'}</button>
          </form>
        </Card>

        <Card title="Borrar este proyecto">
          <form action={deleteProject} className="flex flex-wrap items-center justify-between gap-3">
            {projectField}
            <input type="hidden" name="name" value={project.name} />
            <p className="text-sm text-ink-2">Se borra el proyecto, no las marcas: sus datos y capturas se conservan.</p>
            <div className="flex gap-2">
              <input name="confirm" placeholder={`Escribe "${project.name}"`} className={`${inputClass} w-48`} />
              <button className={`${buttonClass} text-bad`}>Borrar proyecto</button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
