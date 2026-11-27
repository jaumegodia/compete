'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createProjectFor } from '@/lib/projects-admin';
import { projectPath } from '@/lib/project';

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

export async function startProject(form: FormData) {
  const session = await getSession();
  if (!session) redirect('/login?next=/empezar');
  const competitors = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
    .map((i) => ({ name: field(form, `c${i}_name`), url: field(form, `c${i}_url`) }))
    .filter((c) => c.url);
  const res = await createProjectFor(session, {
    name: field(form, 'name'),
    url: field(form, 'url'),
    country: field(form, 'country'),
    vertical: field(form, 'vertical'),
    competitors,
  });
  if ('error' in res) {
    const keep = new URLSearchParams();
    for (const [k, v] of form.entries()) if (typeof v === 'string' && !k.startsWith('$')) keep.set(k, v);
    keep.set('error', res.error);
    redirect(`/empezar?${keep}`);
  }
  revalidatePath('/', 'layout');
  redirect(`${projectPath(res.slug)}?bienvenida=1`);
}
