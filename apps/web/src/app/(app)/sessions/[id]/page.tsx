'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { EmptyState } from '@/components/empty-state';

type Course = { id: string; name: string };
type Teacher = { id: string; firstName: string; lastName: string };
type Student = { id: string; firstName: string; lastName: string };
type Group = {
  id: string;
  courseId: string;
  teacherId: string | null;
  name: string;
};
type SessionStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
type Session = {
  id: string;
  groupId: string;
  teacherId: string | null;
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  status: SessionStatus;
  notes: string | null;
};
type Enrollment = {
  id: string;
  studentId: string;
  status: 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'DROPPED';
};
type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
type Attendance = {
  id: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  notes: string | null;
  markedAt: string;
};

type AttendanceRow = {
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
  notes: string;
};

const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Presente',
  ABSENT: 'Ausente',
  LATE: 'Tarde',
  EXCUSED: 'Justificado',
};

const ATTENDANCE_STATUS_STYLE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-green-50',
  ABSENT: 'bg-red-50',
  LATE: 'bg-amber-50',
  EXCUSED: 'bg-blue-50',
};

const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  SCHEDULED: 'Programada',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const [session, setSession] = useState<Session | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [statusUpdating, setStatusUpdating] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const s = await api<Session>(`/sessions/${sessionId}`);
      setSession(s);

      const [g, allCourses, allTeachers, enrollments, attendance, allStudents] =
        await Promise.all([
          api<Group>(`/groups/${s.groupId}`),
          api<Course[]>('/courses'),
          api<Teacher[]>('/teachers'),
          api<Enrollment[]>(`/enrollments?groupId=${s.groupId}`),
          api<Attendance[]>(`/sessions/${sessionId}/attendance`),
          api<Student[]>('/students'),
        ]);

      setGroup(g);
      setCourse(allCourses.find((c) => c.id === g.courseId) ?? null);
      const sessionTeacherId = s.teacherId ?? g.teacherId;
      setTeacher(sessionTeacherId ? (allTeachers.find((t) => t.id === sessionTeacherId) ?? null) : null);

      const studentById = Object.fromEntries(allStudents.map((st) => [st.id, st]));
      const attendanceByStudent = Object.fromEntries(
        attendance.map((a) => [a.studentId, a]),
      );

      // Roster: alumnos enrolled-ACTIVE del grupo + cualquier alumno con attendance previa
      // (cubre el caso de un alumno que asistió pero luego se dio de baja)
      const rosterIds = new Set<string>();
      enrollments
        .filter((e) => e.status === 'ACTIVE')
        .forEach((e) => rosterIds.add(e.studentId));
      attendance.forEach((a) => rosterIds.add(a.studentId));

      const newRows: AttendanceRow[] = [...rosterIds]
        .map((id) => {
          const student = studentById[id];
          if (!student) return null;
          const existing = attendanceByStudent[id];
          return {
            studentId: id,
            studentName: `${student.firstName} ${student.lastName}`,
            status: existing?.status ?? ('PRESENT' as AttendanceStatus),
            notes: existing?.notes ?? '',
          };
        })
        .filter((r): r is AttendanceRow => r !== null)
        .sort((a, b) => a.studentName.localeCompare(b.studentName, 'es'));

      setRows(newRows);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        setError(err instanceof ApiError ? err.message : 'Error de red');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function updateRow(studentId: string, patch: Partial<AttendanceRow>) {
    setRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r)),
    );
    setSavedAt(null);
  }

  async function handleSaveAttendance() {
    if (rows.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const items = rows.map((r) => ({
        studentId: r.studentId,
        status: r.status,
        ...(r.notes.trim() ? { notes: r.notes.trim() } : {}),
      }));
      await api(`/sessions/${sessionId}/attendance`, {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
      setSavedAt(new Date());
      toast.success('Asistencia guardada');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setSaving(false);
    }
  }

  async function handleSessionStatus(newStatus: SessionStatus) {
    if (!session || newStatus === session.status) return;
    setStatusUpdating(true);
    try {
      const payload: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'COMPLETED') {
        const now = new Date().toISOString();
        if (!session.startedAt) payload.startedAt = now;
        payload.endedAt = now;
      }
      const updated = await api<Session>(`/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setSession(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setStatusUpdating(false);
    }
  }

  const presentCount = useMemo(
    () => rows.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length,
    [rows],
  );

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
        <p className="text-sm text-gray-500 mb-2">Sesión no encontrada.</p>
        <Link href="/groups" className="text-sm hover:underline">
          ← Volver a grupos
        </Link>
      </div>
    );
  }

  if (!session || !group) return null;

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-3">
        <Link
          href={`/groups/${group.id}`}
          className="text-sm text-gray-500 hover:underline"
        >
          ← {group.name}
        </Link>
      </div>

      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold capitalize">
            {formatDateTime(session.scheduledAt)}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {course?.name ?? '—'}
            {teacher && ` · ${teacher.firstName} ${teacher.lastName}`}
          </p>
        </div>
        <label className="text-sm">
          <span className="text-xs text-gray-500 block mb-1">Estado de la sesión</span>
          <select
            value={session.status}
            onChange={(e) => handleSessionStatus(e.target.value as SessionStatus)}
            disabled={statusUpdating}
            className="border rounded px-2 py-1 text-sm bg-white disabled:opacity-50"
          >
            {(Object.keys(SESSION_STATUS_LABEL) as SessionStatus[]).map((s) => (
              <option key={s} value={s}>
                {SESSION_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section>
        <header className="flex items-center justify-between mb-3">
          <h2 className="font-medium">
            Asistencia{' '}
            <span className="text-sm text-gray-500 font-normal">
              ({presentCount} / {rows.length})
            </span>
          </h2>
          {rows.length > 0 && (
            <div className="flex items-center gap-3">
              {savedAt && !saving && (
                <span className="text-xs text-green-700">
                  Guardado {savedAt.toLocaleTimeString('es-ES')}
                </span>
              )}
              <button
                onClick={handleSaveAttendance}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? 'Guardando…' : 'Guardar asistencia'}
              </button>
            </div>
          )}
        </header>

        {error && (
          <p className="text-sm text-red-600 mb-3">{error}</p>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No hay alumnos activos en este grupo"
            description="Inscribe alumnos en el grupo antes de poder marcar la asistencia."
            action={
              <Link href={`/groups/${group.id}`} className="btn-primary">
                Inscribir alumnos
              </Link>
            }
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b text-gray-500">
                <th className="py-2 font-medium">Alumno</th>
                <th className="py-2 font-medium">Estado</th>
                <th className="py-2 font-medium">Notas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.studentId}
                  className={`border-b ${ATTENDANCE_STATUS_STYLE[r.status]}`}
                >
                  <td className="py-2 pr-3">{r.studentName}</td>
                  <td className="py-2 pr-3 w-40">
                    <select
                      value={r.status}
                      onChange={(e) =>
                        updateRow(r.studentId, {
                          status: e.target.value as AttendanceStatus,
                        })
                      }
                      className="border rounded px-2 py-1 text-sm bg-white"
                    >
                      {(Object.keys(ATTENDANCE_STATUS_LABEL) as AttendanceStatus[]).map(
                        (s) => (
                          <option key={s} value={s}>
                            {ATTENDANCE_STATUS_LABEL[s]}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                  <td className="py-2">
                    <input
                      type="text"
                      value={r.notes}
                      onChange={(e) =>
                        updateRow(r.studentId, { notes: e.target.value })
                      }
                      placeholder="Opcional"
                      className="w-full border rounded px-2 py-1 text-sm bg-white"
                    />
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
