import { Badge, Card, Empty, PageHeader, Table, buttonClass } from '@/components/ui';
import { dateTime, num } from '@/lib/format';
import { canDispatch } from '@/lib/github';
import { getProject } from '@/lib/project';
import { getRuns } from '@/lib/queries';
import { runCapture } from '../marcas/actions';

export const dynamic = 'force-dynamic';

const duration = (a: string, b: string | null) => {
  if (!b) return '—';
  const s = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

export default async function Capturas({ params }: { params: Promise<{ project: string }> }) {
  const { project, brands, siteIds } = await getProject((await params).project);
  const runs = await getRuns(siteIds, 100);
  const name = (id: string) => brands.find((b) => b.id === id)?.name ?? '—';
  return (
    <>
      <PageHeader
        title="Capturas"
        subtitle="Cada día a las 05:17 (con respaldo a las 10:47, hora de Madrid) en GitHub Actions."
        actions={
          canDispatch() ? (
            <form action={runCapture}>
              <input type="hidden" name="project" value={project.slug} />
              <button className={buttonClass}>Capturar todo ahora</button>
            </form>
          ) : (
            <span className="text-xs text-ink-3">Configura GITHUB_TOKEN para lanzar capturas desde aquí</span>
          )
        }
      />
      <Card>
        {!runs.length ? (
          <Empty>Todavía no hay capturas.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Inicio</th>
                <th>Marca</th>
                <th>Web</th>
                <th>Estado</th>
                <th>Duración</th>
                <th className="text-right">Productos</th>
                <th className="text-right">Variantes</th>
                <th className="text-right">Cambios</th>
                <th>Avisos / error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-ink-2">{dateTime(r.started_at)}</td>
                  <td>{r.site ? name(r.site.brand_id) : '—'}</td>
                  <td className="text-ink-2">{r.site ? new URL(r.site.base_url).host.replace(/^www\./, '') : '—'}</td>
                  <td>
                    <Badge tone={r.status === 'ok' ? 'good' : r.status === 'error' ? 'bad' : 'neutral'}>
                      {r.status === 'ok' ? 'OK' : r.status === 'error' ? 'Error' : 'En curso'}
                    </Badge>
                  </td>
                  <td className="num whitespace-nowrap text-ink-2">{duration(r.started_at, r.finished_at)}</td>
                  <td className="num text-right">{num(r.products_found)}</td>
                  <td className="num text-right">{num(r.variants_found)}</td>
                  <td className="num text-right">{num(r.events_created)}</td>
                  <td className="max-w-xs truncate text-xs text-ink-3" title={r.error ?? ''}>
                    {r.error ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
