'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, must } from '@/lib/db';
import { dispatchCapture } from '@/lib/github';

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error('Indica la URL de la web.');
  const u = new URL(value.startsWith('http') ? value : `https://${value}`);
  return `${u.protocol}//${u.host}`;
}

function back(message?: string, error = false): never {
  revalidatePath('/', 'layout');
  redirect(`/marcas${message ? `?${error ? 'error' : 'ok'}=${encodeURIComponent(message)}` : ''}`);
}

export async function addBrand(form: FormData) {
  const name = String(form.get('name') ?? '').trim();
  const kind = String(form.get('kind') ?? 'competitor');
  const competitorOf = String(form.get('competitor_of') ?? '');
  let url: string;
  try {
    if (!name) throw new Error('Indica el nombre de la marca.');
    url = normalizeUrl(String(form.get('url') ?? ''));
  } catch (e) {
    back((e as Error).message, true);
  }

  const existing = await db().from('sites').select('id').eq('base_url', url).maybeSingle();
  if (existing.data) back(`La web ${url} ya está dada de alta.`, true);

  const brand = must(
    await db().from('brands').insert({ name, is_own: kind === 'own' }).select('id').single(),
    'insert brand',
  ) as { id: string };
  must(await db().from('sites').insert({ brand_id: brand.id, base_url: url }), 'insert site');
  if (kind === 'competitor' && competitorOf) {
    must(await db().from('brand_competitors').insert({ brand_id: competitorOf, competitor_id: brand.id }), 'insert link');
  }
  back(`${name} añadida. Se capturará en la próxima ejecución diaria, o lánzala ahora con "Capturar".`);
}

export async function addSite(form: FormData) {
  const brandId = String(form.get('brand_id'));
  let url: string;
  try {
    url = normalizeUrl(String(form.get('url') ?? ''));
  } catch (e) {
    back((e as Error).message, true);
  }
  const res = await db().from('sites').insert({ brand_id: brandId, base_url: url });
  if (res.error) back(`No se ha podido añadir la web: ${res.error.message}`, true);
  back(`Web ${url} añadida.`);
}

export async function setSiteActive(form: FormData) {
  const id = String(form.get('site_id'));
  const active = form.get('active') === 'true';
  must(await db().from('sites').update({ active }).eq('id', id), 'update site');
  back(active ? 'Web reactivada.' : 'Web pausada: no se capturará hasta que la reactives.');
}

export async function linkCompetitor(form: FormData) {
  const brandId = String(form.get('brand_id'));
  const competitorId = String(form.get('competitor_id'));
  const linked = form.get('linked') === 'true';
  if (linked) {
    must(await db().from('brand_competitors').delete().eq('brand_id', brandId).eq('competitor_id', competitorId), 'unlink');
  } else {
    must(await db().from('brand_competitors').insert({ brand_id: brandId, competitor_id: competitorId }), 'link');
  }
  back();
}

export async function deleteBrand(form: FormData) {
  const id = String(form.get('brand_id'));
  const name = String(form.get('name'));
  if (String(form.get('confirm') ?? '').trim().toLowerCase() !== name.toLowerCase()) {
    back(`Para borrar ${name} escribe su nombre exacto en la casilla de confirmación.`, true);
  }
  must(await db().from('brands').delete().eq('id', id), 'delete brand');
  back(`${name} y todo su histórico se han borrado.`);
}

export async function runCapture(form: FormData) {
  const site = String(form.get('site') ?? '');
  const mode = (String(form.get('mode') ?? 'full') as 'full' | 'promos');
  try {
    await dispatchCapture(site, mode);
  } catch (e) {
    back((e as Error).message, true);
  }
  back(`Captura lanzada${site ? ` para ${site}` : ''}. Tarda entre 1 y 12 minutos; el resultado aparecerá en Capturas.`);
}
