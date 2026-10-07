'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api, apiBlob, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';

type Remittance = {
  id: string;
  period: string;
  collectionDate: string;
  total: string;
  itemCount: number;
  status: 'SENT' | 'COLLECTED';
  collectedAt: string | null;
  createdAt: string;
  returned: number;
};
type Item = {
  id: string;
  amount: string;
  status: 'SENT' | 'COLLECTED' | 'RETURNED';
  returnReason: string | null;
  returnedAt: string | null;
  invoice: {
    id: string;
    number: string;
    status: string;
    student: { id: string; firstName: string; lastName: string };
  };
};

/** Common SEPA return reason codes (R-transactions). */
const REASONS = [
  'AM04 — Fondos insuficientes',
  'MD06 — Devolución solicitada por el titular',
  'AC04 — Cuenta cancelada',
  'AC01 — IBAN incorrecto',
  'MD01 — Sin mandato válido',
  'MS02 — Motivo no especificado por el titular',
];

const eur = (v: string | number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(v));
const day = (iso: string) => new Date(iso).toLocaleDateString('es-ES');
const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'Error de red');

/**
 * Remittances sent to the bank and what happened to each receipt: mark a
 * remittance as collected (registers the payments) and record returns.
 */
export function RemittanceHistory({ refreshKey }: { refreshKey: number }) {
  const [list, setList] = useState<Remittance[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [returning, setReturning] = useState<Item | null>(null);

  async function load() {
    try {
      setList(await api<Remittance[]>('/billing/remittances'));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }
  async function loadItems(id: string) {
    const d = await api<{ items: Item[] }>(`/billing/remittances/${id}`);
    setItems(d.items);
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  async function toggle(id: string) {
    if (open === id) {
      setOpen(null);
      return;
    }
    setOpen(id);
    setReturning(null);
    await loadItems(id).catch((err) => toast.error(errorMessage(err)));
  }

  async function collect(r: Remittance) {
    const ok = await confirmToast(`¿El banco ya ha cobrado la remesa de ${eur(r.total)}?`, {
      description: `Se registrará el pago domiciliado de sus ${r.itemCount} recibos con fecha ${day(r.collectionDate)}.`,
      confirmLabel: 'Sí, marcar cobrada',
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      const res = await api<{ registered: number }>(`/billing/remittances/${r.id}/collect`, {
        method: 'POST',
      });
      toast.success(`${res.registered} pagos registrados`);
      await load();
      if (open === r.id) await loadItems(r.id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function download(r: Remittance) {
    try {
      const { blob, filename } = await apiBlob(`/billing/remittances/${r.id}/xml`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename ?? `remesa-sepa-${r.period}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function voidIt(r: Remittance) {
    const ok = await confirmToast('¿Anular esta remesa?', {
      description: 'Úsalo solo si no la has subido al banco. Sus facturas podrán ir en otra remesa.',
      confirmLabel: 'Anular',
    });
    if (!ok) return;
    try {
      await api(`/billing/remittances/${r.id}`, { method: 'DELETE' });
      toast.success('Remesa anulada');
      if (open === r.id) setOpen(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (list.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Aún no has generado remesas. Cada remesa descargada aparecerá aquí para marcarla como
        cobrada y registrar las devoluciones.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {list.map((r) => (
        <div key={r.id} className="border rounded-lg bg-white">
          <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <button onClick={() => toggle(r.id)} className="flex-1 min-w-[14rem] text-left">
              <span className="font-medium">
                Remesa {r.period} · {eur(r.total)}
              </span>
              <span className="block text-xs text-gray-500">
                {r.itemCount} recibos · cargo el {day(r.collectionDate)} · generada el{' '}
                {day(r.createdAt)}
              </span>
            </button>
            {r.status === 'COLLECTED' ? (
              <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">Cobrada</span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">Enviada</span>
            )}
            {r.returned > 0 && (
              <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">
                {r.returned} {r.returned === 1 ? 'devuelto' : 'devueltos'}
              </span>
            )}
            <span className="flex items-center gap-3">
              {r.status === 'SENT' && (
                <button
                  onClick={() => collect(r)}
                  disabled={busy === r.id}
                  className="text-brand-700 font-medium hover:underline disabled:opacity-50"
                >
                  Marcar cobrada
                </button>
              )}
              <button onClick={() => download(r)} className="hover:underline">
                XML
              </button>
              {r.status === 'SENT' && r.returned === 0 && (
                <button onClick={() => voidIt(r)} className="text-red-600 hover:underline">
                  Anular
                </button>
              )}
            </span>
          </div>

          {open === r.id && (
            <ul className="border-t divide-y text-sm">
              {items.map((it) => (
                <li key={it.id} className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex-1 min-w-[12rem]">
                      <Link href={`/invoices/${it.invoice.id}`} className="hover:underline">
                        {it.invoice.number}
                      </Link>{' '}
                      · {it.invoice.student.firstName} {it.invoice.student.lastName}
                      {it.returnReason && (
                        <span className="block text-xs text-red-700">
                          Devuelto el {day(it.returnedAt!)}: {it.returnReason}
                        </span>
                      )}
                    </span>
                    <span>{eur(it.amount)}</span>
                    <span className="text-xs text-gray-500 w-20">
                      {it.status === 'SENT' ? 'Enviado' : it.status === 'COLLECTED' ? 'Cobrado' : 'Devuelto'}
                    </span>
                    {it.status !== 'RETURNED' && (
                      <button
                        onClick={() => setReturning(returning?.id === it.id ? null : it)}
                        className="text-red-600 hover:underline"
                      >
                        Recibo devuelto
                      </button>
                    )}
                  </div>
                  {returning?.id === it.id && (
                    <ReturnForm
                      item={it}
                      onDone={async () => {
                        setReturning(null);
                        await loadItems(r.id);
                        await load();
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function ReturnForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const [reason, setReason] = useState(REASONS[0]);
  const [bankFee, setBankFee] = useState('');
  const [chargeFee, setChargeFee] = useState(true);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ feeInvoice: { number: string } | null; notified: boolean }>(
        `/billing/remittance-items/${item.id}/return`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason,
            ...(bankFee ? { bankFee: Number(bankFee), chargeFee } : {}),
            notifyFamily: notify,
          }),
        },
      );
      toast.success(
        [
          `Recibo ${item.invoice.number} devuelto: vuelve a estar pendiente`,
          res.feeInvoice && `comisión en ${res.feeInvoice.number}`,
          notify && (res.notified ? 'familia avisada' : 'no se pudo avisar a la familia'),
        ]
          .filter(Boolean)
          .join(' · '),
      );
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 p-3 rounded bg-red-50 border border-red-100 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-xs text-gray-600 block mb-1">Motivo del banco</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-white"
          >
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-600 block mb-1">Comisión del banco (€)</span>
          <input
            type="number"
            step="0.01"
            min={0}
            value={bankFee}
            onChange={(e) => setBankFee(e.target.value)}
            placeholder="0,00"
            className="border rounded px-2 py-1 text-sm w-28 bg-white"
          />
        </label>
      </div>
      {bankFee && Number(bankFee) > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={chargeFee} onChange={(e) => setChargeFee(e.target.checked)} />
          Repercutir la comisión a la familia (factura aparte)
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Avisar a la familia por email (con enlace para pagar con tarjeta si tiene portal)
      </label>
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? 'Guardando…' : 'Registrar devolución'}
      </button>
    </form>
  );
}
