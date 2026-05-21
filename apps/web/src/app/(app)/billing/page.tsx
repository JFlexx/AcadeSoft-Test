'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

type GenerationStatus = 'CREATED' | 'SKIPPED' | 'NO_FEE' | 'WOULD_CREATE';

type GenerationItem = {
  enrollmentId: string;
  studentName: string;
  groupName: string;
  amount: string | null;
  status: GenerationStatus;
  invoiceId: string | null;
};

type GenerationResponse = {
  period: string;
  dryRun: boolean;
  summary: {
    created: number;
    skipped: number;
    noFee: number;
    wouldCreate: number;
    total: number;
  };
  results: GenerationItem[];
};

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const STATUS_LABEL: Record<GenerationStatus, string> = {
  CREATED: 'Creada',
  SKIPPED: 'Ya existía',
  NO_FEE: 'Sin cuota',
  WOULD_CREATE: 'Se creará',
};

const STATUS_STYLE: Record<GenerationStatus, string> = {
  CREATED: 'bg-green-50 text-green-700',
  SKIPPED: 'bg-gray-100 text-gray-500',
  NO_FEE: 'bg-amber-50 text-amber-700',
  WOULD_CREATE: 'bg-blue-50 text-blue-700',
};

function formatEur(value: string | number | null): string {
  if (value === null || value === '') return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value));
}

export default function BillingPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [response, setResponse] = useState<GenerationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = useMemo(() => {
    const current = now.getFullYear();
    return [current - 1, current, current + 1];
  }, [now]);

  async function run(dryRun: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await api<GenerationResponse>('/billing/generate-month', {
        method: 'POST',
        body: JSON.stringify({ month, year, dryRun }),
      });
      setResponse(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!response?.dryRun) {
      // No preview shown — confirm explicitly before generating blindly.
      if (
        !window.confirm(
          `Vas a generar las facturas de ${MONTHS[month - 1]} ${year} sin vista previa. ¿Continuar?`,
        )
      )
        return;
    } else if (response.summary.wouldCreate === 0) {
      window.alert('No hay nada que generar para este periodo.');
      return;
    }
    await run(false);
  }

  return (
    <div className="p-6 max-w-5xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Mensualidades</h1>
        <p className="text-sm text-gray-600 mt-1">
          Genera de una vez las facturas de todos los alumnos activos con cuota
          mensual configurada. Es seguro re-ejecutar: las facturas ya creadas se
          omiten.
        </p>
      </header>

      <section className="border rounded-lg p-4 bg-white mb-6">
        <div className="flex items-end gap-3 flex-wrap">
          <label className="block">
            <span className="text-xs text-gray-600 block mb-1">Mes</span>
            <select
              value={month}
              onChange={(e) => {
                setMonth(Number(e.target.value));
                setResponse(null);
              }}
              className="border rounded px-2 py-1 text-sm bg-white"
            >
              {MONTHS.map((m, idx) => (
                <option key={m} value={idx + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-gray-600 block mb-1">Año</span>
            <select
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                setResponse(null);
              }}
              className="border rounded px-2 py-1 text-sm bg-white"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => run(true)}
            disabled={loading}
            className="btn-secondary"
          >
            {loading && !response ? 'Calculando…' : 'Vista previa'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="btn-primary"
          >
            {loading && response ? 'Generando…' : 'Generar facturas'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </section>

      {response && (
        <>
          <div className="grid grid-cols-4 gap-3 mb-5">
            <SummaryCard
              label={response.dryRun ? 'Se crearán' : 'Creadas'}
              value={
                response.dryRun
                  ? response.summary.wouldCreate
                  : response.summary.created
              }
              tone="green"
            />
            <SummaryCard
              label="Ya existían"
              value={response.summary.skipped}
              tone="gray"
            />
            <SummaryCard
              label="Sin cuota"
              value={response.summary.noFee}
              tone="amber"
            />
            <SummaryCard
              label="Total alumnos"
              value={response.summary.total}
              tone="gray"
            />
          </div>

          <h2 className="font-medium mb-3">
            Resultado de {MONTHS[month - 1]} {year}
            {response.dryRun && (
              <span className="ml-2 text-xs text-blue-700 font-normal">
                (vista previa — nada se ha guardado)
              </span>
            )}
          </h2>

          {response.results.length === 0 ? (
            <p className="text-sm text-gray-500">
              No hay inscripciones activas en este momento.
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b text-gray-500">
                  <th className="py-2 font-medium">Alumno</th>
                  <th className="py-2 font-medium">Grupo</th>
                  <th className="py-2 font-medium text-right">Importe</th>
                  <th className="py-2 font-medium">Estado</th>
                  <th className="py-2 font-medium text-right">Factura</th>
                </tr>
              </thead>
              <tbody>
                {response.results.map((r) => (
                  <tr key={r.enrollmentId} className="border-b">
                    <td className="py-2">{r.studentName}</td>
                    <td className="py-2 text-gray-600">{r.groupName}</td>
                    <td className="py-2 text-right">{formatEur(r.amount)}</td>
                    <td className="py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[r.status]}`}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {r.invoiceId ? (
                        <Link
                          href={`/invoices/${r.invoiceId}`}
                          className="text-brand-700 hover:underline"
                        >
                          Ver
                        </Link>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'gray' | 'green' | 'amber';
}) {
  const toneClass =
    tone === 'green'
      ? 'text-green-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : 'text-gray-900';
  return (
    <div className="border rounded-lg p-4 bg-white">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
