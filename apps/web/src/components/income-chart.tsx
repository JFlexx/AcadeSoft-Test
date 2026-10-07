'use client';

import { useState } from 'react';

type Point = { month: string; invoiced: string; collected: string };

/** Fixed categorical order (validated: light surface, CVD-safe). */
const SERIES = [
  { key: 'invoiced', label: 'Facturado', color: '#2a78d6' },
  { key: 'collected', label: 'Cobrado', color: '#eb6834' },
] as const;

const eur = (v: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
const monthLabel = (m: string, long = false) =>
  new Date(`${m}-01T12:00:00`).toLocaleDateString('es-ES', long ? { month: 'long', year: 'numeric' } : { month: 'short' });

/**
 * Invoiced vs collected per month: grouped bars on one axis, a legend, a
 * hover tooltip per month and a table view for exact values. No value
 * labels on the bars: two adjacent narrow bars would make them collide.
 */
export function IncomeChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const values = data.map((d) => ({ month: d.month, invoiced: Number(d.invoiced), collected: Number(d.collected) }));
  const max = Math.max(1, ...values.flatMap((v) => [v.invoiced, v.collected]));
  // Round the scale up to a "nice" step so gridlines land on round numbers.
  const step = 10 ** Math.floor(Math.log10(max));
  const top = Math.ceil(max / step) * step;
  const ticks = [0, top / 2, top];
  const H = 180;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-4 text-xs text-gray-600" aria-hidden={asTable}>
          {SERIES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
        <button onClick={() => setAsTable((v) => !v)} className="text-xs text-gray-600 hover:underline">
          {asTable ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>

      {asTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-1.5 font-medium">Mes</th>
              <th className="py-1.5 font-medium text-right">Facturado</th>
              <th className="py-1.5 font-medium text-right">Cobrado</th>
            </tr>
          </thead>
          <tbody>
            {values.map((v) => (
              <tr key={v.month} className="border-b last:border-0">
                <td className="py-1.5 capitalize">{monthLabel(v.month, true)}</td>
                <td className="py-1.5 text-right">{eur(v.invoiced)}</td>
                <td className="py-1.5 text-right">{eur(v.collected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex gap-2" role="img" aria-label="Facturado y cobrado por mes">
          {/* y-axis */}
          <div className="relative w-12 shrink-0 text-[10px] text-gray-400" style={{ height: H }}>
            {ticks.map((t) => (
              <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: H - (t / top) * H }}>
                {eur(t)}
              </span>
            ))}
          </div>
          <div className="relative flex-1 min-w-0">
            {/* recessive gridlines */}
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute inset-x-0 border-t border-gray-100"
                style={{ top: H - (t / top) * H }}
              />
            ))}
            <div className="relative flex items-end gap-1 sm:gap-3" style={{ height: H }}>
              {values.map((v, i) => (
                <div
                  key={v.month}
                  className="relative flex-1 h-full flex items-end justify-center gap-[2px]"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  {hover === i && <div className="absolute inset-0 -mx-1 rounded bg-gray-100/70" />}
                  {SERIES.map((s) => {
                    const val = v[s.key];
                    return (
                      <div key={s.key} className="relative w-full max-w-[18px]" style={{ height: `${(val / top) * 100}%` }}>
                        <div className="absolute inset-0 rounded-t-[4px]" style={{ background: s.color, minHeight: val > 0 ? 2 : 0 }} />
                      </div>
                    );
                  })}
                  {hover === i && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 rounded-md border bg-white shadow-sm px-2.5 py-1.5 text-xs whitespace-nowrap">
                      <p className="font-medium capitalize mb-0.5">{monthLabel(v.month, true)}</p>
                      {SERIES.map((s) => (
                        <p key={s.key} className="flex items-center gap-1.5 text-gray-700">
                          <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                          {s.label}: {eur(v[s.key])}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-1 sm:gap-3 mt-1.5">
              {values.map((v) => (
                <span key={v.month} className="flex-1 text-center text-[10px] text-gray-500 capitalize">
                  {monthLabel(v.month)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
