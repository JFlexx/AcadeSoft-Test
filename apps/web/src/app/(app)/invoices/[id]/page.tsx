'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiBlob, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';
import { EmptyState } from '@/components/empty-state';

type InvoiceStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'PARTIAL'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';

type InvoiceType = 'ORIGINAL' | 'RECTIFICATIVA';

type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';

type Payment = {
  id: string;
  amount: string;
  method: PaymentMethod;
  paidAt: string;
  reference: string | null;
  notes: string | null;
};

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
};

type Invoice = {
  id: string;
  number: string;
  description: string | null;
  notes: string | null;
  amount: string;
  paidAmount: string;
  issueDate: string;
  dueDate: string | null;
  status: InvoiceStatus;
  type: InvoiceType;
  rectifiesId: string | null;
  rectifies: { id: string; number: string } | null;
  rectifiedBy: { id: string; number: string }[];
  student: Student;
  payments: Payment[];
};

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
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  OTHER: 'Otro',
};

const EMPTY_PAYMENT = {
  amount: '',
  method: 'CASH' as PaymentMethod,
  paidAt: '',
  reference: '',
  notes: '',
};

const EMPTY_RECT = { amount: '', reason: '' };

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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params.id;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [showRectForm, setShowRectForm] = useState(false);
  const [rectForm, setRectForm] = useState(EMPTY_RECT);
  const [rectSubmitting, setRectSubmitting] = useState(false);
  const [rectError, setRectError] = useState<string | null>(null);

  const [cancelling, setCancelling] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [paying, setPaying] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const data = await api<Invoice>(`/invoices/${invoiceId}`);
      setInvoice(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  function openPaymentForm() {
    if (!invoice) return;
    const pending = Number(invoice.amount) - Number(invoice.paidAmount);
    setPaymentForm({ ...EMPTY_PAYMENT, amount: pending.toFixed(2) });
    setShowPaymentForm(true);
    setPaymentError(null);
  }

  function closePaymentForm() {
    setShowPaymentForm(false);
    setPaymentForm(EMPTY_PAYMENT);
    setPaymentError(null);
  }

  async function handlePaymentSubmit(e: FormEvent) {
    e.preventDefault();
    setPaymentSubmitting(true);
    setPaymentError(null);
    try {
      const payload: Record<string, unknown> = {
        amount: Number(paymentForm.amount),
        method: paymentForm.method,
      };
      if (paymentForm.paidAt)
        payload.paidAt = new Date(paymentForm.paidAt).toISOString();
      if (paymentForm.reference.trim())
        payload.reference = paymentForm.reference.trim();
      if (paymentForm.notes.trim()) payload.notes = paymentForm.notes.trim();

      await api(`/invoices/${invoiceId}/payments`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      closePaymentForm();
      toast.success('Pago registrado');
      await refresh();
    } catch (err) {
      setPaymentError(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setPaymentSubmitting(false);
    }
  }

  async function handleDeletePayment(p: Payment) {
    const ok = await confirmToast(
      `¿Eliminar el pago de ${formatEur(p.amount)} del ${formatDate(p.paidAt)}?`,
      {
        description: 'Se recalculará el estado de la factura.',
        confirmLabel: 'Eliminar',
      },
    );
    if (!ok) return;
    try {
      await api(`/payments/${p.id}`, { method: 'DELETE' });
      toast.success('Pago eliminado');
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error de red');
    }
  }

  async function handleDownloadPdf() {
    if (!invoice) return;
    setDownloadingPdf(true);
    try {
      const { blob, filename } = await apiBlob(`/invoices/${invoice.id}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename ?? `factura-${invoice.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Error descargando PDF',
      );
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handlePayOnline() {
    setPaying(true);
    try {
      const { url } = await api<{ url: string }>(
        `/invoices/${invoiceId}/checkout`,
        { method: 'POST' },
      );
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al iniciar el pago');
      setPaying(false);
    }
  }

  async function handleCancelInvoice() {
    const ok = await confirmToast('¿Anular esta factura?', {
      description:
        'Después no aceptará más pagos. Esto no borra los pagos ya registrados.',
      confirmLabel: 'Anular',
    });
    if (!ok) return;
    setCancelling(true);
    try {
      await api(`/invoices/${invoiceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      toast.success('Factura anulada');
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setCancelling(false);
    }
  }

  async function handleRectSubmit(e: FormEvent) {
    e.preventDefault();
    setRectSubmitting(true);
    setRectError(null);
    try {
      await api(`/invoices/${invoiceId}/rectifications`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(rectForm.amount),
          reason: rectForm.reason.trim(),
        }),
      });
      setShowRectForm(false);
      setRectForm(EMPTY_RECT);
      toast.success('Rectificativa emitida');
      await refresh();
    } catch (err) {
      setRectError(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setRectSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Cargando…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500 mb-2">Factura no encontrada.</p>
        <Link href="/invoices" className="text-sm hover:underline">
          ← Volver a facturas
        </Link>
      </div>
    );
  }

  if (!invoice) return null;

  const pending = Number(invoice.amount) - Number(invoice.paidAmount);
  const canRegisterPayment =
    invoice.status !== 'CANCELLED' && invoice.status !== 'PAID';
  const canCancel =
    invoice.status !== 'CANCELLED' && invoice.status !== 'PAID';
  const canRectify =
    invoice.type === 'ORIGINAL' &&
    invoice.status !== 'CANCELLED' &&
    invoice.rectifiedBy.length === 0;

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-3">
        <Link href="/invoices" className="text-sm text-gray-500 hover:underline">
          ← Facturas
        </Link>
      </div>

      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold font-mono">{invoice.number}</h1>
            <span
              className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[invoice.status]}`}
            >
              {STATUS_LABEL[invoice.status]}
            </span>
            {invoice.type === 'RECTIFICATIVA' && (
              <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                RECTIFICATIVA
              </span>
            )}
          </div>
          {invoice.description && (
            <p className="text-sm text-gray-600 mt-1">{invoice.description}</p>
          )}
          {invoice.type === 'RECTIFICATIVA' && invoice.rectifies && (
            <p className="text-sm text-gray-500 mt-1">
              Rectifica a{' '}
              <Link
                href={`/invoices/${invoice.rectifies.id}`}
                className="text-brand-700 hover:underline font-mono"
              >
                {invoice.rectifies.number}
              </Link>
            </p>
          )}
          {invoice.rectifiedBy.length > 0 && (
            <p className="text-sm text-amber-700 mt-1">
              Rectificada por{' '}
              {invoice.rectifiedBy.map((r) => (
                <Link
                  key={r.id}
                  href={`/invoices/${r.id}`}
                  className="underline font-mono"
                >
                  {r.number}
                </Link>
              ))}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {canRegisterPayment && (
            <button
              onClick={handlePayOnline}
              disabled={paying}
              className="btn-primary"
            >
              {paying ? 'Redirigiendo…' : 'Pagar con tarjeta'}
            </button>
          )}
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="btn-secondary"
          >
            {downloadingPdf ? 'Descargando…' : 'Descargar PDF'}
          </button>
          {canRectify && !showRectForm && (
            <button
              onClick={() => {
                setShowRectForm(true);
                setRectForm({
                  amount: Number(invoice.amount).toFixed(2),
                  reason: '',
                });
                setRectError(null);
              }}
              className="btn-secondary"
            >
              Emitir rectificativa
            </button>
          )}
          {canCancel && (
            <button
              onClick={handleCancelInvoice}
              disabled={cancelling}
              className="btn-secondary text-red-600"
            >
              {cancelling ? 'Anulando…' : 'Anular factura'}
            </button>
          )}
        </div>
      </header>

      {showRectForm && (
        <form
          onSubmit={handleRectSubmit}
          className="border rounded p-4 mb-6 space-y-3 bg-amber-50 border-amber-200"
        >
          <h2 className="font-medium text-sm">
            Nueva factura rectificativa — corrige{' '}
            <span className="font-mono">{invoice.number}</span>
          </h2>
          <p className="text-xs text-gray-600">
            La factura original quedará anulada. La rectificativa llevará el
            importe corregido y su propio número en la cadena Verifactu.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-600 block mb-1">
                Importe corregido (€) *
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={rectForm.amount}
                onChange={(e) =>
                  setRectForm({ ...rectForm, amount: e.target.value })
                }
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-600 block mb-1">
                Motivo *
              </span>
              <input
                type="text"
                required
                maxLength={200}
                placeholder="Ej. Error en el importe, descuento aplicado…"
                value={rectForm.reason}
                onChange={(e) =>
                  setRectForm({ ...rectForm, reason: e.target.value })
                }
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
          {rectError && <p className="text-sm text-red-600">{rectError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={rectSubmitting}
              className="btn-primary"
            >
              {rectSubmitting ? 'Emitiendo…' : 'Emitir rectificativa'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowRectForm(false);
                setRectError(null);
              }}
              className="btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <section className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-8 max-w-md">
        <span className="text-gray-500">Alumno</span>
        <span>
          {invoice.student.firstName} {invoice.student.lastName}
          {invoice.student.email && (
            <span className="text-gray-400 ml-1">({invoice.student.email})</span>
          )}
        </span>
        <span className="text-gray-500">Fecha emisión</span>
        <span>{formatDate(invoice.issueDate)}</span>
        <span className="text-gray-500">Vencimiento</span>
        <span>{formatDate(invoice.dueDate)}</span>
        <span className="text-gray-500">Importe</span>
        <span className="font-medium">{formatEur(invoice.amount)}</span>
        <span className="text-gray-500">Cobrado</span>
        <span className="text-green-700">{formatEur(invoice.paidAmount)}</span>
        <span className="text-gray-500">Pendiente</span>
        <span className={pending > 0 ? 'text-amber-700 font-medium' : ''}>
          {invoice.status === 'CANCELLED' ? '—' : formatEur(pending)}
        </span>
        {invoice.notes && (
          <>
            <span className="text-gray-500">Notas</span>
            <span className="text-gray-700">{invoice.notes}</span>
          </>
        )}
      </section>

      <section>
        <header className="flex items-center justify-between mb-3">
          <h2 className="font-medium">
            Pagos{' '}
            <span className="text-sm text-gray-500 font-normal">
              ({invoice.payments.length})
            </span>
          </h2>
          {canRegisterPayment && !showPaymentForm && (
            <button onClick={openPaymentForm} className="btn-primary">
              + Registrar pago
            </button>
          )}
        </header>

        {showPaymentForm && (
          <form
            onSubmit={handlePaymentSubmit}
            className="border rounded p-4 mb-4 space-y-3 bg-gray-50"
          >
            <h3 className="text-sm font-medium">Nuevo pago</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-600 block mb-1">
                  Importe (€) *
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={pending}
                  required
                  value={paymentForm.amount}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, amount: e.target.value })
                  }
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-600 block mb-1">Método</span>
                <select
                  value={paymentForm.method}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      method: e.target.value as PaymentMethod,
                    })
                  }
                  className="w-full border rounded px-2 py-1 text-sm bg-white"
                >
                  {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                    <option key={m} value={m}>
                      {METHOD_LABEL[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-600 block mb-1">Fecha</span>
                <input
                  type="date"
                  value={paymentForm.paidAt}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, paidAt: e.target.value })
                  }
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-600 block mb-1">
                  Referencia
                </span>
                <input
                  type="text"
                  placeholder="Ej. TRX-12345"
                  value={paymentForm.reference}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      reference: e.target.value,
                    })
                  }
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </label>
              <label className="block col-span-2">
                <span className="text-xs text-gray-600 block mb-1">Notas</span>
                <input
                  type="text"
                  value={paymentForm.notes}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, notes: e.target.value })
                  }
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </label>
            </div>
            {paymentError && (
              <p className="text-sm text-red-600">{paymentError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={paymentSubmitting}
                className="btn-primary"
              >
                {paymentSubmitting ? 'Registrando…' : 'Registrar'}
              </button>
              <button
                type="button"
                onClick={closePaymentForm}
                className="btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {invoice.payments.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="Sin pagos registrados"
            description={
              canRegisterPayment
                ? 'Registra los pagos que recibas para llevar el control de lo cobrado y lo pendiente.'
                : 'Esta factura no admite nuevos pagos.'
            }
            action={
              canRegisterPayment && !showPaymentForm ? (
                <button onClick={openPaymentForm} className="btn-primary">
                  + Registrar pago
                </button>
              ) : undefined
            }
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b text-gray-500">
                <th className="py-2 font-medium">Fecha</th>
                <th className="py-2 font-medium">Método</th>
                <th className="py-2 font-medium">Referencia</th>
                <th className="py-2 font-medium">Notas</th>
                <th className="py-2 font-medium text-right">Importe</th>
                <th className="py-2 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoice.payments.map((p) => (
                <tr key={p.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 text-gray-600">
                    {formatDateTime(p.paidAt)}
                  </td>
                  <td className="py-2">{METHOD_LABEL[p.method]}</td>
                  <td className="py-2 text-gray-600">{p.reference ?? '—'}</td>
                  <td className="py-2 text-gray-600 max-w-xs truncate">
                    {p.notes ?? '—'}
                  </td>
                  <td className="py-2 text-right font-medium">
                    {formatEur(p.amount)}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleDeletePayment(p)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
