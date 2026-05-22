'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { api, apiBlob, ApiError } from '@/lib/api';

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

type SepaIncluded = {
  invoiceId: string;
  number: string;
  studentName: string;
  amount: string;
};

type SepaSkipped = {
  invoiceId: string;
  number: string;
  studentName: string;
  reason: string;
};

type SepaPreview = {
  period: string;
  totalAmount: string;
  count: number;
  included: SepaIncluded[];
  skipped: SepaSkipped[];
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

  const [sepaPreview, setSepaPreview] = useState<SepaPreview | null>(null);
  const [sepaLoading, setSepaLoading] = useState<'preview' | 'download' | null>(
    null,
  );
  const [sepaError, setSepaError] = useState<string | null>(null);
  const [collectionDate, setCollectionDate] = useState('');

  const years = useMemo(() => {
    const current = now.getFullYear();
    return [current - 1, current, current + 1];
  }, [now]);

  function resetAll() {
    setResponse(null);
    setSepaPreview(null);
    setSepaError(null);
    setError(null);
  }

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

  async function runSepaPreview() {
    setSepaLoading('preview');
    setSepaError(null);
    try {
      const res = await api<SepaPreview>('/billing/sepa-remittance/preview', {
        method: 'POST',
        body: JSON.stringify({ month, year }),
      });
      setSepaPreview(res);
    } catch (err) {
      setSepaError(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setSepaLoading(null);
    }
  }

  async function handleSepaDownload() {
    setSepaLoading('download');
    setSepaError(null);
    try {
      const payload: Record<string, unknown> = { month, year };
      if (collectionDate) {
        payload.collectionDate = new Date(collectionDate).toISOString();
      }
      const { blob, filename } = await apiBlob('/billing/sepa-remittance', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename ?? `remesa-sepa-${year}-${month}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setSepaError(err instanceof ApiError ? err.message : 'Error descargando XML');
    } finally {
      setSepaLoading(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl space-y-8">
      <header>
        <h1 className="text-xl font-semibold">Mensualidades</h1>
        <p className="text-sm text-gray-600 mt-1">
          Genera facturas mensuales y la remesa SEPA para cobrarlas por
          domiciliación. Las facturas ya creadas se respetan al re-ejecutar.
        </p>
      </header>

      <section className="border rounded-lg p-4 bg-white">
        <div className="flex items-end gap-3 flex-wrap">
          <label className="block">
            <span className="text-xs text-gray-600 block mb-1">Mes</span>
            <select
              value={month}
              onChange={(e) => {
                setMonth(Number(e.target.value));
                resetAll();
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
                resetAll();
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
        </div>
      </section>

      {/* ─── Generar facturas (recurring billing) ───────────────────── */}
      <section className="border rounded-lg p-4 bg-white space-y-4">
        <header>
          <h2 className="font-medium">1. Generar facturas mensuales</h2>
          <p className="text-xs text-gray-600 mt-1">
            Crea una factura por cada inscripción activa con cuota mensual
            configurada.
          </p>
        </header>

        <div className="flex items-center gap-3">
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
        {error && <p className="text-sm text-red-600">{error}</p>}

        {response && (
          <>
            <div className="grid grid-cols-4 gap-3">
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

            {response.dryRun && (
              <p className="text-xs text-blue-700">
                Vista previa — nada se ha guardado todavía.
              </p>
            )}

            {response.results.length > 0 && (
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
      </section>

      {/* ─── Remesa SEPA ──────────────────────────────────────────── */}
      <section className="border rounded-lg p-4 bg-white space-y-4">
        <header>
          <h2 className="font-medium">2. Generar remesa SEPA</h2>
          <p className="text-xs text-gray-600 mt-1">
            Crea el fichero XML pain.008 para domiciliar las facturas
            pendientes del mes en el banco. Necesita IBAN + identificador de
            acreedor en{' '}
            <Link href="/settings" className="text-brand-700 hover:underline">
              Ajustes
            </Link>{' '}
            y mandato de domiciliación en cada alumno.
          </p>
        </header>

        <div className="flex items-end gap-3 flex-wrap">
          <label className="block">
            <span className="text-xs text-gray-600 block mb-1">
              Fecha de cobro
            </span>
            <input
              type="date"
              value={collectionDate}
              onChange={(e) => setCollectionDate(e.target.value)}
              className="border rounded px-2 py-1 text-sm bg-white"
            />
          </label>
          <button
            onClick={runSepaPreview}
            disabled={sepaLoading !== null}
            className="btn-secondary"
          >
            {sepaLoading === 'preview' ? 'Calculando…' : 'Vista previa SEPA'}
          </button>
          <button
            onClick={handleSepaDownload}
            disabled={sepaLoading !== null}
            className="btn-primary"
          >
            {sepaLoading === 'download' ? 'Generando…' : 'Descargar remesa XML'}
          </button>
        </div>
        {sepaError && <p className="text-sm text-red-600">{sepaError}</p>}

        {sepaPreview && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <SummaryCard
                label="Domiciliables"
                value={sepaPreview.count}
                tone="green"
              />
              <SummaryCard
                label="Omitidas"
                value={sepaPreview.skipped.length}
                tone="amber"
              />
              <SummaryCardText
                label="Total a cobrar"
                value={formatEur(sepaPreview.totalAmount)}
                tone="green"
              />
            </div>

            {sepaPreview.included.length > 0 && (
              <div>
                <h3 className="font-medium text-sm text-gray-700 mb-2">
                  Incluidas en la remesa
                </h3>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left border-b text-gray-500">
                      <th className="py-2 font-medium">Nº</th>
                      <th className="py-2 font-medium">Alumno</th>
                      <th className="py-2 font-medium text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sepaPreview.included.map((i) => (
                      <tr key={i.invoiceId} className="border-b">
                        <td className="py-2 font-mono text-xs">
                          <Link
                            href={`/invoices/${i.invoiceId}`}
                            className="text-brand-700 hover:underline"
                          >
                            {i.number}
                          </Link>
                        </td>
                        <td className="py-2">{i.studentName}</td>
                        <td className="py-2 text-right">{formatEur(i.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {sepaPreview.skipped.length > 0 && (
              <div>
                <h3 className="font-medium text-sm text-gray-700 mb-2">
                  Omitidas
                </h3>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left border-b text-gray-500">
                      <th className="py-2 font-medium">Nº</th>
                      <th className="py-2 font-medium">Alumno</th>
                      <th className="py-2 font-medium">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sepaPreview.skipped.map((s) => (
                      <tr key={s.invoiceId} className="border-b">
                        <td className="py-2 font-mono text-xs">
                          <Link
                            href={`/invoices/${s.invoiceId}`}
                            className="text-brand-700 hover:underline"
                          >
                            {s.number}
                          </Link>
                        </td>
                        <td className="py-2">{s.studentName}</td>
                        <td className="py-2 text-amber-700 text-xs">
                          {s.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
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

function SummaryCardText({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
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
