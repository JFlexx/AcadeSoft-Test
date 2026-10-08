'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';
import { announceEnrollmentFee, askChargeEnrollmentFee } from '@/lib/enrollment-fee';

type WaitlistEntry = {
  id: string;
  studentId: string;
  enrolledAt: string;
  spotOfferedAt: string | null;
  notes: string | null;
};
type Student = { id: string; firstName: string; lastName: string; email: string | null };

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'Error de red');
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The group's waiting list, first come first served. When a spot frees up
 * the admin emails the next family ("Ofrecer plaza") and, once they
 * confirm, gives them the spot.
 */
export function GroupWaitlist({
  entries,
  studentById,
  freeSpots,
  enrollmentFee,
  onChange,
}: {
  entries: WaitlistEntry[];
  enrollmentFee: string | null;
  studentById: Record<string, Student>;
  /** null when the group has no capacity limit. */
  freeSpots: number | null;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const queue = [...entries].sort((a, b) => a.enrolledAt.localeCompare(b.enrolledAt));

  const nameOf = (e: WaitlistEntry) => {
    const s = studentById[e.studentId];
    return s ? `${s.firstName} ${s.lastName}` : '(alumno)';
  };

  async function offer(e: WaitlistEntry) {
    setBusy(e.id);
    try {
      await api(`/enrollments/${e.id}/offer-spot`, { method: 'POST' });
      toast.success(`Email enviado a la familia de ${nameOf(e)}`);
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function give(e: WaitlistEntry) {
    if (freeSpots === 0) {
      const ok = await confirmToast('El grupo está completo', {
        description: `¿Inscribir a ${nameOf(e)} igualmente, por encima del aforo?`,
        confirmLabel: 'Inscribir',
      });
      if (!ok) return;
    }
    const chargeEnrollmentFee = await askChargeEnrollmentFee(enrollmentFee);
    setBusy(e.id);
    try {
      const res = await api<{ enrollmentFeeInvoice: { number: string; amount: string } | null }>(
        `/enrollments/${e.id}`,
        { method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE', chargeEnrollmentFee }) },
      );
      toast.success(`${nameOf(e)} ya está inscrito`);
      announceEnrollmentFee(res.enrollmentFeeInvoice);
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(e: WaitlistEntry) {
    const ok = await confirmToast(`¿Quitar a ${nameOf(e)} de la lista de espera?`, {
      confirmLabel: 'Quitar',
    });
    if (!ok) return;
    try {
      await api(`/enrollments/${e.id}`, { method: 'DELETE' });
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div>
      {freeSpots != null && freeSpots > 0 && (
        <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">
          {freeSpots === 1 ? 'Hay 1 plaza libre' : `Hay ${freeSpots} plazas libres`} y{' '}
          {queue.length === 1 ? '1 persona esperando' : `${queue.length} personas esperando`}:
          ofrécesela a la primera de la lista.
        </p>
      )}
      <ol className="divide-y border rounded-lg bg-white">
        {queue.map((e, i) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <span className="w-6 text-gray-400 font-medium">{i + 1}.</span>
            <span className="grow basis-48 min-w-0">
              <span className="block font-medium truncate">{nameOf(e)}</span>
              <span className="block text-xs text-gray-500">
                En espera desde el {day(e.enrolledAt)}
                {e.spotOfferedAt && (
                  <span className="text-amber-700"> · plaza ofrecida el {day(e.spotOfferedAt)}</span>
                )}
              </span>
              {e.notes && <span className="block text-xs text-gray-500 truncate">«{e.notes}»</span>}
            </span>
            <span className="flex items-center gap-3 ml-9 sm:ml-0">
              <button
                onClick={() => offer(e)}
                disabled={busy === e.id}
                className="text-sm hover:underline disabled:opacity-50"
              >
                {e.spotOfferedAt ? 'Reenviar aviso' : 'Ofrecer plaza'}
              </button>
              <button
                onClick={() => give(e)}
                disabled={busy === e.id}
                className="text-sm text-brand-700 font-medium hover:underline disabled:opacity-50"
              >
                Dar plaza
              </button>
              <button onClick={() => remove(e)} className="text-sm text-red-600 hover:underline">
                Quitar
              </button>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
