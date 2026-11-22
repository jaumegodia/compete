'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface TrafficSeries {
  key: string; // id de la marca
  name: string;
  color: string;
}

/** Filas por mes: { month: 'AAAA-MM-01', [brandId]: visitas } */
export type TrafficPoint = { month: string } & Record<string, number | string | null>;

const int = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 0 });
const compact = (v: number) => v.toLocaleString('es-ES', { notation: 'compact', maximumFractionDigits: 1 });
const month = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });

/** Evolución mensual de una métrica de tráfico, una línea por marca (color fijo por marca). */
export function TrafficChart({ data, series, label }: { data: TrafficPoint[]; series: TrafficSeries[]; label: string }) {
  if (data.length < 2) return <p className="py-8 text-center text-sm text-ink-3">Todavía no hay histórico suficiente.</p>;
  return (
    <div className="h-72 w-full" role="img" aria-label={label}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#ecebe7" vertical={false} />
          <XAxis dataKey="month" tickFormatter={month} tick={{ fontSize: 12, fill: '#52514e' }} axisLine={{ stroke: '#d9d8d3' }} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={compact} tick={{ fontSize: 12, fill: '#52514e' }} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            formatter={(v) => (typeof v === 'number' ? int(v) : '—')}
            labelFormatter={(d) => month(String(d))}
            contentStyle={{ borderRadius: 8, border: '1px solid #e6e5e1', fontSize: 13 }}
            cursor={{ stroke: '#8a8a85', strokeDasharray: '3 3' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
