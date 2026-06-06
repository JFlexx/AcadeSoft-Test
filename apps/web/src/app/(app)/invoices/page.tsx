'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Receipt } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { EmptyState } from '@/components/empty-state';

type InvoiceStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'PARTIAL'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';

type InvoiceType = 'ORIGINAL' | 'RECTIFICATIVA';

type Invoice = {
  id: string;
  studentId: string;
  number: string;
  description: string | null;
  amount: string;
  paidAmount: string;
  issueDate: string;
  dueDate: string | null;
  status: InvoiceStatus;
  type: InvoiceType;
};

type Student = { id: string; firstName: string; lastName: string };

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Borrador',
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Cobrada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Anulada',
};

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING: 'bg-amber-50 text-amber-700',
  PARTIAL: 'bg-blue-50 text-blue-700',
  PAID: 'bg-green-50 text-green-700',
  OVERDUE: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500 line-through',
};

const STATUS_FILTERS: { value: '' | InvoiceStatus; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'PARTIAL', label: 'Parciales' },
  { value: 'PAID', label: 'Cobradas' },
  { value: 'OVERDUE', label: 'Vencidas' },
  { value: 'CANCELLED', label: 'Anuladas' },
];

const EMPTY_FORM = {
  studentId: '',
  amount: '',
  description: '',
  dueDate: '',
};

function formatEur(value: string | number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value));
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES');
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'' | InvoiceStatus>('');
  const [filterStudent, setFilterStudent] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [inv, st] = await Promise.all([
        api<Invoice[]>('/invoices'),
        api<Student[]>('/students'),
      ]);
      setInvoices(inv);
      setStudents(st);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const studentById = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s])),
    [students],
  );

  const filtered = invoices.filter((i) => {
    if (filterStatus && i.status !== filterStatus) return false;
    if (filterStudent && i.studentId !== filterStudent) return false;
    return true;
  });

  const totals = useMemo(() => {
    let billed = 0;
    let collected = 0;
    let pending = 0;
    for (const i of filtered) {
      if (i.status === 'CANCELLED') continue;
      billed += Number(i.amount);
      collected += Number(i.paidAmount);
      pending += Number(i.amount) - Number(i.paidAmount);
    }
    return { billed, collected, pending };
  }, [filtered]);

  function startCreate() {
    setForm({ ...EMPTY_FORM, studentId: students[0]?.id ?? '' });
    setShowForm(true);
    setError(null);
  }

  function cancel() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        studentId: form.studentId,
        amount: Number(form.amount),
      };
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.dueDate) payload.dueDate = new Date(form.dueDate).toISOString();

      await api('/invoices', { method: 'POST', body: JSON.stringify(payload) });
      cancel();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Facturas</h1>
        {!showForm && (
          <button
            onClick={startCreate}
            disabled={students.length === 0}
            className="btn-primary"
            title={students.length === 0 ? 'Crea primero un alumno' : ''}
          >
            + Nueva factura
          </button>
        )}
      </header>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border rounded p-4 mb-6 space-y-3 bg-gray-50"
        >
          <h2 className="font-medium">Nueva factura</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-600 block mb-1">Alumno *</span>
              <select
                value={form.studentId}
                onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                required
                className="w-full border rounded px-2 py-1 text-sm bg-white"
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-600 block mb-1">Importe (€) *</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="block col-span-2">
              <span className="text-xs text-gray-600 block mb-1">Concepto</span>
              <input
                type="text"
                placeholder="Ej. Mensualidad octubre"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-600 block mb-1">Vencimiento</span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Creando…' : 'Crear factura'}
            </button>
            <button type="button" onClick={cancel} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-3 gap-3 mb-5">
        <SummaryCard label="Facturado" value={formatEur(totals.billed)} />
        <SummaryCard
          label="Cobrado"
          value={formatEur(totals.collected)}
          tone="green"
        />
        <SummaryCard
          label="Pendiente"
          value={formatEur(totals.pending)}
          tone={totals.pending > 0 ? 'amber' : 'gray'}
        />
      </div>

      <div className="mb-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600">Estado:</label>
          <select
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as '' | InvoiceStatus)
            }
            className="border rounded px-2 py-1 text-sm bg-white"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600">Alumno:</label>
          <select
            value={filterStudent}
            onChange={(e) => setFilterStudent(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-white"
          >
            <option value="">Todos</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Todavía no hay facturas"
          description={
            students.length === 0
              ? 'Necesitas tener alumnos antes de poder emitir facturas.'
              : 'Emite tu primera factura, o genera las mensualidades del mes desde la sección Mensualidades.'
          }
          action={
            students.length === 0 ? (
              <Link href="/students" className="btn-primary">
                Crear un alumno
              </Link>
            ) : (
              !showForm && (
                <button onClick={startCreate} className="btn-primary">
                  + Nueva factura
                </button>
              )
            )
          }
        />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500">
          No hay facturas que coincidan con los filtros.
        </p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b text-gray-500">
              <th className="py-2 font-medium">Nº</th>
              <th className="py-2 font-medium">Alumno</th>
              <th className="py-2 font-medium">Concepto</th>
              <th className="py-2 font-medium">Fecha</th>
              <th className="py-2 font-medium text-right">Importe</th>
              <th className="py-2 font-medium text-right">Pendiente</th>
              <th className="py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => {
              const s = studentById[i.studentId];
              const pending = Number(i.amount) - Number(i.paidAmount);
              return (
                <tr key={i.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 font-mono text-xs">
                    <Link
                      href={`/invoices/${i.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {i.number}
                    </Link>
                  </td>
                  <td className="py-2">
                    {s ? `${s.firstName} ${s.lastName}` : '—'}
                  </td>
                  <td className="py-2 text-gray-600 max-w-xs truncate">
                    {i.description ?? '—'}
                  </td>
                  <td className="py-2 text-gray-600">
                    {formatDate(i.issueDate)}
                  </td>
                  <td className="py-2 text-right">{formatEur(i.amount)}</td>
                  <td className="py-2 text-right">
                    {i.status === 'CANCELLED' ? '—' : formatEur(pending)}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[i.status]}`}
                      >
                        {STATUS_LABEL[i.status]}
                      </span>
                      {i.type === 'RECTIFICATIVA' && (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                          R
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'gray',
}: {
  label: string;
  value: string;
  tone?: 'gray' | 'green' | 'amber';
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
