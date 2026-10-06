'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';

type Result = {
  dryRun: boolean;
  summary: { created: number; wouldCreate: number; skipped: number; total: string };
};

const eur = (v: string | number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(v));
const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'Error de red');

/** Charge a one-off concept (libro, material, excursión…) to the whole group. */
export function ChargeGroupPanel({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [preview, setPreview] = useState<Result['summary'] | null>(null);
  const [busy, setBusy] = useState(false);

  const body = (dryRun: boolean) =>
    JSON.stringify({
      groupId,
      description: description.trim(),
      amount: Number(amount),
      ...(dueDate ? { dueDate: new Date(`${dueDate}T12:00:00`).toISOString() } : {}),
      dryRun,
    });

  async function handlePreview(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<Result>('/billing/charge-group', { method: 'POST', body: body(true) });
      setPreview(res.summary);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCharge() {
    setBusy(true);
    try {
      const res = await api<Result>('/billing/charge-group', { method: 'POST', body: body(false) });
      toast.success(
        res.summary.created > 0
          ? `${res.summary.created} facturas emitidas (${eur(res.summary.total)})`
          : 'No había nada nuevo que facturar',
      );
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border rounded p-4 mb-6 bg-gray-50 space-y-3">
      <h3 className="text-sm font-medium">Cobrar un concepto a todo el grupo</h3>
      <p className="text-xs text-gray-500">
        Libros, material, una excursión… Se emite una factura por alumno activo, por el mismo
        importe (el descuento de hermanos solo se aplica a la mensualidad).
      </p>
      <form onSubmit={handlePreview} className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-xs text-gray-600 block mb-1">Concepto *</span>
          <input
            required
            maxLength={200}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setPreview(null);
            }}
            placeholder="Libro de texto B1"
            className="border rounded px-2 py-1 text-sm w-56 bg-white"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-600 block mb-1">Importe por alumno (€) *</span>
          <input
            required
            type="number"
            step="0.01"
            min={0.01}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setPreview(null);
            }}
            className="border rounded px-2 py-1 text-sm w-32 bg-white"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-600 block mb-1">Vencimiento</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-white"
          />
        </label>
        <button type="submit" disabled={busy} className="btn-secondary">
          Ver previsión
        </button>
        <button type="button" onClick={onClose} className="text-sm text-gray-600 hover:underline px-2">
          Cancelar
        </button>
      </form>

      {preview && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            {preview.wouldCreate > 0 ? (
              <>
                Se emitirán <strong>{preview.wouldCreate} facturas</strong> por un total de{' '}
                <strong>{eur(preview.total)}</strong>
              </>
            ) : (
              'Todos los alumnos ya tienen hoy esta factura'
            )}
            {preview.skipped > 0 && (
              <span className="text-gray-500"> · {preview.skipped} ya la tenían hoy</span>
            )}
          </span>
          {preview.wouldCreate > 0 && (
            <button onClick={handleCharge} disabled={busy} className="btn-primary">
              {busy ? 'Emitiendo…' : `Emitir ${preview.wouldCreate} facturas`}
            </button>
          )}
          <Link href="/invoices" className="text-xs text-gray-500 hover:underline">
            Ver facturas
          </Link>
        </div>
      )}
    </div>
  );
}
