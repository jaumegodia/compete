import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = '', right }: { title?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`rounded-lg border border-line bg-surface p-5 shadow-card ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-ink-2">{label}</div>
      <div className="num mt-1 text-xl font-medium text-ink">{value}</div>
      {hint && <div className="text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

const TONES = {
  neutral: 'bg-neutral-soft text-ink-2',
  good: 'bg-good-soft text-good',
  bad: 'bg-bad-soft text-bad',
  warn: 'bg-warn-soft text-warn',
  accent: 'bg-accent-soft text-accent',
} as const;

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function BrandDot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />;
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm [&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:pb-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-[0.06em] [&_th]:text-ink-3 [&_tbody_tr:hover]:bg-sunken">
        {children}
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-3">{children}</p>;
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-accent underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}

export const buttonClass =
  'inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-hover disabled:opacity-50';
export const primaryButtonClass =
  'inline-flex items-center gap-1.5 rounded-md bg-night px-3 py-1.5 text-sm font-medium text-white hover:bg-night-2 disabled:opacity-50';
export const inputClass =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring';
