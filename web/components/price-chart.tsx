'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface PricePoint {
  date: string; // AAAA-MM-DD
  price: number | null;
  compareAt: number | null;
}

const eur = (v: number) => v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

/** Evolución del precio (y del precio tachado, si lo hay) de una variante o del mínimo del producto. */
export function PriceChart({ data, label }: { data: PricePoint[]; label: string }) {
  const hasCompare = data.some((d) => d.compareAt !== null);
  if (data.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-ink-3">
        El histórico empieza con la primera captura; la línea aparecerá a partir del segundo día.
      </p>
    );
  }
  return (
    <div className="h-64 w-full" role="img" aria-label={`Evolución del precio: ${label}`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#ecebe7" vertical={false} />
          <XAxis dataKey="date" tickFormatter={day} tick={{ fontSize: 12, fill: '#52514e' }} axisLine={{ stroke: '#d9d8d3' }} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={eur} tick={{ fontSize: 12, fill: '#52514e' }} axisLine={false} tickLine={false} width={72} domain={['auto', 'auto']} />
          <Tooltip
            formatter={(v) => (typeof v === 'number' ? eur(v) : String(v ?? '—'))}
            labelFormatter={(d) => day(String(d))}
            contentStyle={{ borderRadius: 8, border: '1px solid #e6e5e1', fontSize: 13 }}
            cursor={{ stroke: '#8a8a85', strokeDasharray: '3 3' }}
          />
          {hasCompare && <Legend wrapperStyle={{ fontSize: 12 }} />}
          <Line type="stepAfter" dataKey="price" name="Precio" stroke="#2a78d6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} connectNulls />
          {hasCompare && (
            <Line type="stepAfter" dataKey="compareAt" name="Precio tachado" stroke="#eb6834" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4 }} connectNulls />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
