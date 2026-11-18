import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = '', right }: { title?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`rounded-lg border border-line bg-surface p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
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
      <div className="text-xs text-ink-2">{label}</div>
      <div className="num mt-0.5 text-lg font-semibold">{value}</div>
      {hint && <div className="text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

const TONES = {
  neutral: 'bg-[#efeeea] text-ink-2',
  good: 'bg-[#e3f3e8] text-good',
  bad: 'bg-[#fbe7e5] text-bad',
  warn: 'bg-[#fdf0d9] text-warn',
  accent: 'bg-[#e1edfb] text-accent',
} as const;

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function BrandDot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />;
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm [&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:pb-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-ink-2">
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
    <Link href={href} className="text-accent hover:underline">
      {children}
    </Link>
  );
}

export const buttonClass =
  'inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-[#f1f0ec] disabled:opacity-50';
export const primaryButtonClass =
  'inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1c5cab] disabled:opacity-50';
export const inputClass =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-[#cde2fb]';
