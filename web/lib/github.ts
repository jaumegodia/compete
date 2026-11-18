import 'server-only';

/** Lanza el workflow de captura en GitHub Actions (necesita GITHUB_TOKEN con permiso Actions: write). */
export async function dispatchCapture(site = '', mode: 'full' | 'dry' | 'promos' = 'full'): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO ?? 'jaumegodia/compete';
  if (!token) throw new Error('Falta GITHUB_TOKEN: no se pueden lanzar capturas desde el panel.');
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/scrape.yml/dispatches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({ ref: 'main', inputs: { mode, site } }),
  });
  if (!res.ok) throw new Error(`GitHub respondió ${res.status}: ${await res.text()}`);
}

export const canDispatch = () => Boolean(process.env.GITHUB_TOKEN);
