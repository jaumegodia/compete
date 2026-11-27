import { inputClass, primaryButtonClass } from '@/components/ui';
import { createProject } from './actions';

/** Alta de proyecto: la marca propia y su web. `from` es la página a la que volver si hay un error. */
export function NewProjectForm({ from = '/' }: { from?: string }) {
  return (
    <form action={createProject} className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
      <input type="hidden" name="from" value={from} />
      <label className="flex flex-col gap-1 text-xs text-ink-2">
        Tu marca
        <input name="name" required placeholder="Tu marca" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-2">
        Web
        <input name="url" required placeholder="www.tumarca.com" className={inputClass} />
      </label>
      <button className={primaryButtonClass}>Crear proyecto</button>
    </form>
  );
}
