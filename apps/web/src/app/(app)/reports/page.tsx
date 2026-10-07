'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { csvAmount, downloadCsv } from '@/lib/csv';
import { IncomeChart } from '@/components/income-chart';

type Overview = {
  period: { from: string; to: string };
  income: {
    invoiced: string;
    collected: string;
    byMonth: { month: string; invoiced: string; collected: string }[];
    byGroup: { name: string; course: string; invoiced: string; collected: string }[];
    other: { invoiced: string; collected: string };
  };
  receivables: {
    pending: string;
    overdue: string;
    aging: { notDue: string; d0_30: string; d31_60: string; d60plus: string };
    topDebtors: { studentId: string; name: string; pending: string; oldestDue: string | null }[];
  };
  students: { active: number; joined: number; left: number };
  attendance: { name: string; attended: number; marked: number; rate: number | null }[];
};

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const eur = (v: string | number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(v));
const dmy = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'Error de red');

function presets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const school = m >= 8 ? y : y - 1;
  const q = Math.floor(m / 3) * 3;
  return {
    course: { label: 'Este curso', from: `${school}-09-01`, to: ymd(now) },
    month: { label: 'Este mes', from: `${y}-${pad(m + 1)}-01`, to: ymd(now) },
    quarter: { label: 'Este trimestre', from: `${y}-${pad(q + 1)}-01`, to: ymd(now) },
    year: { label: 'Este año', from: `${y}-01-01`, to: ymd(now) },
  };
}
type PresetKey = keyof ReturnType<typeof presets>;

const METHOD: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  DIRECT_DEBIT: 'Domiciliación',
  OTHER: 'Otro',
};
const STATUS: Record<string, string> = {
  DRAFT: 'Borrador',
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Cobrada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Anulada',
};

export default function ReportsPage() {
  const all = useMemo(presets, []);
  const [preset, setPreset] = useState<PresetKey | 'custom'>('course');
  const [range, setRange] = useState({ from: all.course.from, to: all.course.to });
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!range.from || !range.to || range.from > range.to) return;
    setLoading(true);
    api<Overview>(`/reports/overview?${new URLSearchParams(range)}`)
      .then(setData)
      .catch((err) => toast.error(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [range]);

  function choose(key: PresetKey | 'custom') {
    setPreset(key);
    if (key !== 'custom') setRange({ from: all[key].from, to: all[key].to });
  }

  async function exportInvoices() {
    try {
      const rows = await api<
        {
          number: string;
          issueDate: string;
          dueDate: string | null;
          type: string;
          rectifies: string | null;
          customer: string;
          address: string | null;
          description: string | null;
          amount: string;
          paid: string;
          status: string;
        }[]
      >(`/reports/invoice-book?${new URLSearchParams(range)}`);
      downloadCsv(
        `libro-facturas-${range.from}-${range.to}.csv`,
        ['Número', 'Fecha', 'Vencimiento', 'Tipo', 'Rectifica a', 'Cliente', 'Dirección', 'Concepto', 'Importe', 'Cobrado', 'Estado'],
        rows.map((r) => [
          r.number,
          dmy(r.issueDate),
          r.dueDate ? dmy(r.dueDate) : '',
          r.type === 'RECTIFICATIVA' ? 'Rectificativa' : 'Ordinaria',
          r.rectifies ?? '',
          r.customer,
          r.address ?? '',
          r.description ?? '',
          csvAmount(r.amount),
          csvAmount(r.paid),
          STATUS[r.status] ?? r.status,
        ]),
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function exportPayments() {
    try {
      const rows = await api<
        { date: string; invoice: string; customer: string; method: string; amount: string; reference: string | null }[]
      >(`/reports/payments?${new URLSearchParams(range)}`);
      downloadCsv(
        `cobros-${range.from}-${range.to}.csv`,
        ['Fecha', 'Factura', 'Cliente', 'Método', 'Importe', 'Referencia'],
        rows.map((r) => [dmy(r.date), r.invoice, r.customer, METHOD[r.method] ?? r.method, csvAmount(r.amount), r.reference ?? '']),
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const aging = data
    ? [
        { label: 'Sin vencer', value: Number(data.receivables.aging.notDue) },
        { label: 'Vencido 0–30 días', value: Number(data.receivables.aging.d0_30) },
        { label: 'Vencido 31–60 días', value: Number(data.receivables.aging.d31_60) },
        { label: 'Vencido más de 60 días', value: Number(data.receivables.aging.d60plus) },
      ]
    : [];
  const agingMax = Math.max(1, ...aging.map((a) => a.value));

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Informes</h1>
          <p className="text-sm text-gray-500 mt-1">Ingresos, cobros, alumnos y asistencia del periodo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(all) as PresetKey[]).map((k) => (
            <button
              key={k}
              onClick={() => choose(k)}
              className={`text-sm px-3 py-1.5 rounded-full border ${
                preset === k ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white text-gray-600'
              }`}
            >
              {all[k].label}
            </button>
          ))}
          <input
            type="date"
            aria-label="Desde"
            value={range.from}
            onChange={(e) => {
              setPreset('custom');
              setRange({ ...range, from: e.target.value });
            }}
            className="border rounded px-2 py-1 text-sm"
          />
          <input
            type="date"
            aria-label="Hasta"
            value={range.to}
            min={range.from}
            onChange={(e) => {
              setPreset('custom');
              setRange({ ...range, to: e.target.value });
            }}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
      </header>

      {!data ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : (
        <div className={`space-y-6 ${loading ? 'opacity-60' : ''}`}>
          <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat label="Facturado" value={eur(data.income.invoiced)} />
            <Stat label="Cobrado" value={eur(data.income.collected)} />
            <Stat label="Pendiente hoy" value={eur(data.receivables.pending)} />
            <Stat label="Vencido hoy" value={eur(data.receivables.overdue)} tone={Number(data.receivables.overdue) > 0 ? 'warn' : undefined} />
            <Stat
              label="Alumnos activos"
              value={String(data.students.active)}
              hint={`${data.students.joined} altas · ${data.students.left} bajas`}
            />
          </section>

          <section className="border rounded-lg bg-white p-4">
            <h2 className="font-medium mb-3">Facturado y cobrado por mes</h2>
            <IncomeChart data={data.income.byMonth} />
          </section>

          <div className="grid lg:grid-cols-2 gap-6">
            <section className="border rounded-lg bg-white p-4">
              <h2 className="font-medium mb-3">Pendiente de cobro (hoy)</h2>
              <ul className="space-y-2 text-sm">
                {aging.map((a) => (
                  <li key={a.label}>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{a.label}</span>
                      <span className="font-medium">{eur(a.value)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded bg-gray-100">
                      <div className="h-full rounded bg-gray-500" style={{ width: `${(a.value / agingMax) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              {data.receivables.topDebtors.length > 0 && (
                <>
                  <h3 className="text-sm font-medium mt-5 mb-2">Quién debe más</h3>
                  <table className="w-full text-sm">
                    <tbody>
                      {data.receivables.topDebtors.map((d) => (
                        <tr key={d.studentId} className="border-b last:border-0">
                          <td className="py-1.5">
                            <Link href={`/students/${d.studentId}`} className="hover:underline">
                              {d.name}
                            </Link>
                            {d.oldestDue && (
                              <span className="block text-xs text-gray-500">vencido desde el {dmy(d.oldestDue)}</span>
                            )}
                          </td>
                          <td className="py-1.5 text-right font-medium">{eur(d.pending)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </section>

            <section className="border rounded-lg bg-white p-4">
              <h2 className="font-medium mb-3">Por grupo</h2>
              {data.income.byGroup.length === 0 ? (
                <p className="text-sm text-gray-500">Sin facturación en el periodo.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-1.5 font-medium">Grupo</th>
                      <th className="py-1.5 font-medium text-right">Facturado</th>
                      <th className="py-1.5 font-medium text-right">Cobrado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.income.byGroup.map((g) => (
                      <tr key={g.name} className="border-b last:border-0">
                        <td className="py-1.5">
                          {g.name}
                          <span className="block text-xs text-gray-500">{g.course}</span>
                        </td>
                        <td className="py-1.5 text-right">{eur(g.invoiced)}</td>
                        <td className="py-1.5 text-right">{eur(g.collected)}</td>
                      </tr>
                    ))}
                    {Number(data.income.other.invoiced) > 0 && (
                      <tr>
                        <td className="py-1.5 text-gray-500">Otros conceptos</td>
                        <td className="py-1.5 text-right">{eur(data.income.other.invoiced)}</td>
                        <td className="py-1.5 text-right">{eur(data.income.other.collected)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              <h3 className="text-sm font-medium mt-5 mb-2">Asistencia</h3>
              {data.attendance.length === 0 ? (
                <p className="text-sm text-gray-500">Sin asistencia registrada en el periodo.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.attendance.map((a) => (
                      <tr key={a.name} className="border-b last:border-0">
                        <td className="py-1.5">{a.name}</td>
                        <td className="py-1.5 text-right text-gray-500 text-xs">
                          {a.attended} de {a.marked}
                        </td>
                        <td className="py-1.5 text-right font-medium w-14">{a.rate != null ? `${a.rate}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <section className="border rounded-lg bg-white p-4">
            <h2 className="font-medium">Para la gestoría</h2>
            <p className="text-sm text-gray-500 mt-1 mb-3">
              Del {dmy(range.from)} al {dmy(range.to)}, en CSV para Excel.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={exportInvoices} className="btn-secondary inline-flex items-center gap-1">
                <Download className="h-4 w-4" /> Libro de facturas emitidas
              </button>
              <button onClick={exportPayments} className="btn-secondary inline-flex items-center gap-1">
                <Download className="h-4 w-4" /> Cobros
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warn' }) {
  return (
    <div className="border rounded-lg bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${tone === 'warn' ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}
