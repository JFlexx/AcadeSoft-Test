'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { MessageSquareText, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { EmptyState } from '@/components/empty-state';

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
type Student = {
  id: string;
  firstName: string;
  lastName: string;
  attendance: { status: Status; notes: string | null } | null;
};
type Detail = {
  id: string;
  scheduledAt: string;
  durationMinutes: number | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  notes: string | null;
  group: { id: string; name: string; course: { name: string; color: string | null } };
  students: Student[];
};
type Mark = { status: Status | null; notes: string };

const OPTIONS: { value: Status; label: string; active: string }[] = [
  { value: 'PRESENT', label: 'Presente', active: 'bg-green-600 text-white border-green-600' },
  { value: 'ABSENT', label: 'Falta', active: 'bg-red-600 text-white border-red-600' },
  { value: 'LATE', label: 'Tarde', active: 'bg-amber-500 text-white border-amber-500' },
  { value: 'EXCUSED', label: 'Justif.', active: 'bg-gray-600 text-white border-gray-600' },
];

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'Error de red');

function marksFrom(d: Detail): Record<string, Mark> {
  return Object.fromEntries(
    d.students.map((s) => [
      s.id,
      { status: s.attendance?.status ?? null, notes: s.attendance?.notes ?? '' },
    ]),
  );
}

export default function TakeAttendancePage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [saved, setSaved] = useState<Record<string, Mark>>({});
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  function load(d: Detail) {
    const m = marksFrom(d);
    setDetail(d);
    setMarks(m);
    setSaved(m);
  }

  useEffect(() => {
    api<Detail>(`/teacher/sessions/${id}`)
      .then(load)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else toast.error(errorMessage(err));
      })
      .finally(() => setLoading(false));
  }, [id]);

  const dirty = useMemo(() => JSON.stringify(marks) !== JSON.stringify(saved), [marks, saved]);
  const counts = useMemo(() => {
    const values = Object.values(marks);
    return {
      marked: values.filter((m) => m.status).length,
      present: values.filter((m) => m.status === 'PRESENT' || m.status === 'LATE').length,
    };
  }, [marks]);

  function set(studentId: string, patch: Partial<Mark>) {
    setMarks((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  }

  function allPresent() {
    setMarks((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([k, m]) => [k, m.status ? m : { ...m, status: 'PRESENT' }]),
      ),
    );
  }

  async function save() {
    const items = Object.entries(marks)
      .filter(([, m]) => m.status)
      .map(([studentId, m]) => ({
        studentId,
        status: m.status as Status,
        ...(m.notes.trim() ? { notes: m.notes.trim() } : {}),
      }));
    if (items.length === 0) return;
    setSaving(true);
    try {
      load(
        await api<Detail>(`/teacher/sessions/${id}/attendance`, {
          method: 'PUT',
          body: JSON.stringify({ items }),
        }),
      );
      toast.success('Asistencia guardada');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Cargando…</p>;
  if (notFound || !detail) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-500">Esta clase no existe o no es tuya.</p>
        <Link href="/teacher" className="text-sm hover:underline">
          ← Mis clases
        </Link>
      </div>
    );
  }

  const start = new Date(detail.scheduledAt);
  const end = new Date(start.getTime() + (detail.durationMinutes ?? 60) * 60_000);
  const cancelled = detail.status === 'CANCELLED';
  const total = detail.students.length;

  return (
    <div className="pb-24">
      <Link href="/teacher" className="text-sm text-gray-500 hover:underline">
        ← Mis clases
      </Link>
      <header
        className="mt-3 mb-4 rounded-xl border bg-white p-4"
        style={{ borderLeft: `4px solid ${detail.group.course.color ?? '#6366f1'}` }}
      >
        <h1 className="text-lg font-semibold">{detail.group.name}</h1>
        <p className="text-sm text-gray-600">
          {start.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}{' '}
          · {start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}–
          {end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {detail.group.course.name} · {counts.marked}/{total} marcados · {counts.present}{' '}
          asistentes
        </p>
        {cancelled && (
          <p className="mt-2 text-sm text-red-700">
            Clase cancelada: no se puede pasar lista.
          </p>
        )}
      </header>

      {total === 0 ? (
        <EmptyState
          icon={Users}
          title="Sin alumnos"
          description="Este grupo no tiene alumnos activos."
        />
      ) : (
        <>
          {!cancelled && counts.marked < total && (
            <button onClick={allPresent} className="btn-secondary w-full mb-3">
              Marcar el resto como presentes
            </button>
          )}
          <ul className="space-y-2">
            {detail.students.map((s) => {
              const m = marks[s.id];
              return (
                <li key={s.id} className="rounded-xl border bg-white p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-medium truncate">
                      {s.firstName} {s.lastName}
                    </span>
                    <button
                      onClick={() => setOpenNotes((o) => ({ ...o, [s.id]: !o[s.id] }))}
                      className={`p-1 ${m.notes ? 'text-brand-700' : 'text-gray-400'} hover:text-gray-700`}
                      aria-label="Nota"
                      disabled={cancelled}
                    >
                      <MessageSquareText className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        disabled={cancelled}
                        onClick={() => set(s.id, { status: o.value })}
                        className={`rounded-lg border py-2 text-sm font-medium disabled:opacity-50 ${
                          m.status === o.value ? o.active : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {(openNotes[s.id] || m.notes) && (
                    <input
                      value={m.notes}
                      maxLength={500}
                      disabled={cancelled}
                      onChange={(e) => set(s.id, { notes: e.target.value })}
                      placeholder="Nota (opcional)"
                      className="mt-2 w-full border rounded px-2 py-1.5 text-sm"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {!cancelled && total > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <span className="text-sm text-gray-600 flex-1">
              {dirty ? 'Cambios sin guardar' : counts.marked === total ? 'Lista completa' : `${total - counts.marked} sin marcar`}
            </span>
            <button
              onClick={save}
              disabled={saving || !dirty || counts.marked === 0}
              className="btn-primary"
            >
              {saving ? 'Guardando…' : 'Guardar asistencia'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
