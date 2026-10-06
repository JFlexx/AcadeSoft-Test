'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';
import { announceEnrollmentFee, askChargeEnrollmentFee } from '@/lib/enrollment-fee';
import { EmptyState } from '@/components/empty-state';

type Attendance = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | null;
type Trial = {
  id: string;
  status: 'BOOKED' | 'CONVERTED' | 'CANCELLED';
  createdAt: string;
  studentId: string;
  attendance: Attendance;
  student: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    guardians: { firstName: string; lastName: string; email: string | null; phone: string | null }[];
  };
  session: {
    id: string;
    scheduledAt: string;
    status: string;
    group: { id: string; name: string; enrollmentFee: string | null; course: { name: string } };
  };
};

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'Error de red');

const when = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const ATTENDANCE: Record<Exclude<Attendance, null>, { label: string; cls: string }> = {
  PRESENT: { label: 'Vino', cls: 'bg-green-100 text-green-700' },
  LATE: { label: 'Vino (tarde)', cls: 'bg-green-100 text-green-700' },
  ABSENT: { label: 'No vino', cls: 'bg-red-100 text-red-700' },
  EXCUSED: { label: 'Avisó que no venía', cls: 'bg-gray-100 text-gray-700' },
};

/** Trial classes: who's coming, who to follow up with, and enrolling them. */
export default function TrialsPage() {
  const [trials, setTrials] = useState<Trial[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      setTrials(await api<Trial[]>('/trials'));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function convert(t: Trial, status: 'ACTIVE' | 'WAITLIST') {
    const chargeEnrollmentFee =
      status === 'ACTIVE' && (await askChargeEnrollmentFee(t.session.group.enrollmentFee));
    setBusy(t.id);
    try {
      const res = await api<{ enrollmentFeeInvoice: { number: string; amount: string } | null }>(
        `/trials/${t.id}/convert`,
        { method: 'POST', body: JSON.stringify({ status, chargeEnrollmentFee }) },
      );
      announceEnrollmentFee(res.enrollmentFeeInvoice);
      toast.success(
        status === 'ACTIVE'
          ? `${t.student.firstName} inscrito en ${t.session.group.name}`
          : `${t.student.firstName} añadido a la lista de espera`,
      );
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(t: Trial, upcoming: boolean) {
    const ok = await confirmToast(
      upcoming ? `¿Cancelar la clase de prueba de ${t.student.firstName}?` : `¿Descartar a ${t.student.firstName}?`,
      { confirmLabel: upcoming ? 'Cancelar prueba' : 'Descartar' },
    );
    if (!ok) return;
    try {
      await api(`/trials/${t.id}/cancel`, { method: 'POST' });
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const now = Date.now();
  const booked = trials.filter((t) => t.status === 'BOOKED');
  const upcoming = booked
    .filter((t) => new Date(t.session.scheduledAt).getTime() > now)
    .sort((a, b) => a.session.scheduledAt.localeCompare(b.session.scheduledAt));
  const followUp = booked.filter((t) => new Date(t.session.scheduledAt).getTime() <= now);
  const done = trials.filter((t) => t.status !== 'BOOKED');

  function Row({ t, isUpcoming }: { t: Trial; isUpcoming: boolean }) {
    const g = t.student.guardians[0];
    const contact = [g?.email ?? t.student.email, g?.phone ?? t.student.phone].filter(Boolean).join(' · ');
    return (
      <li className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
        <div className="flex-1 min-w-[14rem]">
          <p className="font-medium">
            <Link href={`/students/${t.studentId}`} className="hover:underline">
              {t.student.firstName} {t.student.lastName}
            </Link>
            {g && <span className="text-gray-500 font-normal"> · familia: {g.firstName} {g.lastName}</span>}
          </p>
          <p className="text-xs text-gray-500">
            <Link href={`/groups/${t.session.group.id}`} className="hover:underline">
              {t.session.group.name}
            </Link>{' '}
            · {when(t.session.scheduledAt)}
            {contact && <> · {contact}</>}
          </p>
          {t.student.notes && <p className="text-xs text-gray-500 truncate">«{t.student.notes}»</p>}
        </div>
        {!isUpcoming && t.status === 'BOOKED' && (
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              t.attendance ? ATTENDANCE[t.attendance].cls : 'bg-amber-50 text-amber-700'
            }`}
          >
            {t.attendance ? ATTENDANCE[t.attendance].label : 'Sin pasar lista'}
          </span>
        )}
        {t.status === 'CONVERTED' && (
          <span className="text-xs px-2 py-0.5 rounded bg-brand-50 text-brand-700">Inscrito</span>
        )}
        {t.status === 'CANCELLED' && (
          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">Cancelada</span>
        )}
        {t.status === 'BOOKED' && (
          <span className="flex items-center gap-3">
            {!isUpcoming && (
              <>
                <button
                  onClick={() => convert(t, 'ACTIVE')}
                  disabled={busy === t.id}
                  className="text-brand-700 font-medium hover:underline disabled:opacity-50"
                >
                  Inscribir
                </button>
                <button
                  onClick={() => convert(t, 'WAITLIST')}
                  disabled={busy === t.id}
                  className="hover:underline disabled:opacity-50"
                >
                  A lista de espera
                </button>
              </>
            )}
            <button onClick={() => cancel(t, isUpcoming)} className="text-red-600 hover:underline">
              {isUpcoming ? 'Cancelar' : 'Descartar'}
            </button>
          </span>
        )}
      </li>
    );
  }

  return (
    <div className="p-6 max-w-4xl space-y-8">
      <header>
        <h1 className="text-xl font-semibold">Clases de prueba</h1>
        <p className="text-sm text-gray-500 mt-1">
          Las familias las reservan desde tu página de inscripción (actívalo en{' '}
          <Link href="/settings" className="underline">
            Ajustes
          </Link>
          ). El profesor las ve en su lista y, tras la clase, aquí decides si se inscriben.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : trials.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Aún no hay clases de prueba"
          description="Cuando una familia reserve una clase de prueba aparecerá aquí."
        />
      ) : (
        <>
          <section>
            <h2 className="font-medium mb-2">Por hacer seguimiento ({followUp.length})</h2>
            {followUp.length === 0 ? (
              <p className="text-sm text-gray-500">Nada pendiente. 👍</p>
            ) : (
              <ul className="divide-y border rounded-lg bg-white">
                {followUp.map((t) => (
                  <Row key={t.id} t={t} isUpcoming={false} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="font-medium mb-2">Próximas ({upcoming.length})</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-500">No hay clases de prueba reservadas.</p>
            ) : (
              <ul className="divide-y border rounded-lg bg-white">
                {upcoming.map((t) => (
                  <Row key={t.id} t={t} isUpcoming />
                ))}
              </ul>
            )}
          </section>

          {done.length > 0 && (
            <section>
              <button onClick={() => setShowDone((v) => !v)} className="text-sm text-gray-600 hover:underline">
                {showDone ? 'Ocultar historial' : `Ver historial (${done.length})`}
              </button>
              {showDone && (
                <ul className="divide-y border rounded-lg bg-white mt-2">
                  {done.map((t) => (
                    <Row key={t.id} t={t} isUpcoming={false} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
