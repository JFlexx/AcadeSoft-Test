'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

type Course = { id: string; name: string };
type Teacher = { id: string; firstName: string; lastName: string };
type Student = { id: string; firstName: string; lastName: string; email: string | null };
type Group = {
  id: string;
  courseId: string;
  teacherId: string | null;
  name: string;
  description: string | null;
  maxCapacity: number | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
};
type Enrollment = {
  id: string;
  studentId: string;
  groupId: string;
  status: 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'DROPPED';
  enrolledAt: string;
  droppedAt: string | null;
  notes: string | null;
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

const ENROLLMENT_STATUS_LABEL: Record<Enrollment['status'], string> = {
  ACTIVE: 'Activo',
  PENDING: 'Pendiente',
  COMPLETED: 'Completado',
  DROPPED: 'Baja',
};

const SESSION_STATUS_STYLE: Record<SessionStatus, string> = {
  SCHEDULED: 'bg-gray-100 text-gray-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  SCHEDULED: 'Programada',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

const EMPTY_SESSION_FORM = {
  scheduledAt: '',
  teacherId: '',
  notes: '',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function GroupDetailPage() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;

  const [group, setGroup] = useState<Group | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Enrollment form state
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollStudentId, setEnrollStudentId] = useState('');
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  // Session form state
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [sessionForm, setSessionForm] = useState(EMPTY_SESSION_FORM);
  const [sessionSubmitting, setSessionSubmitting] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const g = await api<Group>(`/groups/${groupId}`);
      setGroup(g);
      const [enr, sess, allStudents, allCourses, teachers] = await Promise.all([
        api<Enrollment[]>(`/enrollments?groupId=${groupId}`),
        api<Session[]>(`/sessions?groupId=${groupId}`),
        api<Student[]>('/students'),
        api<Course[]>('/courses'),
        api<Teacher[]>('/teachers'),
      ]);
      setEnrollments(enr);
      setSessions(sess);
      setStudents(allStudents);
      setAllTeachers(teachers);
      setCourse(allCourses.find((c) => c.id === g.courseId) ?? null);
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
  }, [groupId]);

  const studentById = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s])),
    [students],
  );
  const teacherById = useMemo(
    () => Object.fromEntries(allTeachers.map((t) => [t.id, t])),
    [allTeachers],
  );

  const groupTeacher = group?.teacherId ? teacherById[group.teacherId] : null;

  const enrolledStudentIds = useMemo(
    () => new Set(enrollments.map((e) => e.studentId)),
    [enrollments],
  );
  const availableStudents = students.filter((s) => !enrolledStudentIds.has(s.id));

  // ─── enrollment handlers ────────────────────────────────────────────────────

  async function handleEnroll() {
    if (!enrollStudentId) return;
    setEnrollSubmitting(true);
    setEnrollError(null);
    try {
      await api('/enrollments', {
        method: 'POST',
        body: JSON.stringify({ studentId: enrollStudentId, groupId }),
      });
      setEnrollOpen(false);
      setEnrollStudentId('');
      await refresh();
    } catch (err) {
      setEnrollError(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setEnrollSubmitting(false);
    }
  }

  async function handleEnrollmentStatus(enrollmentId: string, status: Enrollment['status']) {
    try {
      const payload: Record<string, unknown> = { status };
      if (status === 'DROPPED') payload.droppedAt = new Date().toISOString();
      await api(`/enrollments/${enrollmentId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await refresh();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Error de red');
    }
  }

  async function handleUnenroll(enrollmentId: string, studentName: string) {
    if (!window.confirm(`¿Quitar a ${studentName} del grupo?`)) return;
    try {
      await api(`/enrollments/${enrollmentId}`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Error de red');
    }
  }

  // ─── session handlers ───────────────────────────────────────────────────────

  function startCreateSession() {
    setEditingSession(null);
    setSessionForm({
      scheduledAt: '',
      teacherId: group?.teacherId ?? '',
      notes: '',
    });
    setShowSessionForm(true);
    setSessionError(null);
  }

  function startEditSession(s: Session) {
    setEditingSession(s);
    setSessionForm({
      scheduledAt: s.scheduledAt.slice(0, 16),
      teacherId: s.teacherId ?? '',
      notes: s.notes ?? '',
    });
    setShowSessionForm(true);
    setSessionError(null);
  }

  function cancelSessionForm() {
    setShowSessionForm(false);
    setEditingSession(null);
    setSessionForm(EMPTY_SESSION_FORM);
    setSessionError(null);
  }

  async function handleSessionSubmit(e: FormEvent) {
    e.preventDefault();
    setSessionSubmitting(true);
    setSessionError(null);
    try {
      const payload: Record<string, unknown> = {
        scheduledAt: new Date(sessionForm.scheduledAt).toISOString(),
      };
      if (sessionForm.teacherId) payload.teacherId = sessionForm.teacherId;
      if (sessionForm.notes.trim()) payload.notes = sessionForm.notes.trim();

      if (editingSession) {
        await api(`/sessions/${editingSession.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        payload.groupId = groupId;
        await api('/sessions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      cancelSessionForm();
      await refresh();
    } catch (err) {
      setSessionError(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setSessionSubmitting(false);
    }
  }

  async function handleDeleteSession(s: Session) {
    if (!window.confirm(`¿Borrar la sesión del ${formatDateTime(s.scheduledAt)}?`)) return;
    try {
      await api(`/sessions/${s.id}`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Error de red');
    }
  }

  // ─── render ─────────────────────────────────────────────────────────────────

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
        <p className="text-sm text-gray-500 mb-2">Grupo no encontrado.</p>
        <Link href="/groups" className="text-sm hover:underline">
          ← Volver a grupos
        </Link>
      </div>
    );
  }

  if (!group) return null;

  const activeCount = enrollments.filter((e) => e.status === 'ACTIVE').length;

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-3">
        <Link href="/groups" className="text-sm text-gray-500 hover:underline">
          ← Grupos
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-xl font-semibold">{group.name}</h1>
        {group.description && (
          <p className="text-sm text-gray-600 mt-1">{group.description}</p>
        )}
      </header>

      <section className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-8 max-w-md">
        <span className="text-gray-500">Curso</span>
        <span>{course?.name ?? '—'}</span>
        <span className="text-gray-500">Profesor</span>
        <span>
          {groupTeacher ? `${groupTeacher.firstName} ${groupTeacher.lastName}` : 'Sin asignar'}
        </span>
        <span className="text-gray-500">Aforo</span>
        <span>
          {activeCount}
          {group.maxCapacity ? ` / ${group.maxCapacity}` : ''}
          {' alumnos activos'}
        </span>
        <span className="text-gray-500">Periodo</span>
        <span>
          {group.startDate ? group.startDate.slice(0, 10) : '—'}
          {' → '}
          {group.endDate ? group.endDate.slice(0, 10) : '—'}
        </span>
        <span className="text-gray-500">Estado</span>
        <span>{group.isActive ? 'Activo' : 'Inactivo'}</span>
      </section>

      <section>
        <header className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Alumnos inscritos</h2>
          {!enrollOpen && (
            <button
              onClick={() => {
                setEnrollOpen(true);
                setEnrollStudentId(availableStudents[0]?.id ?? '');
                setEnrollError(null);
              }}
              disabled={availableStudents.length === 0}
              className="bg-black text-white text-sm px-3 py-2 rounded disabled:opacity-50"
              title={availableStudents.length === 0 ? 'No hay alumnos sin inscribir' : ''}
            >
              + Inscribir alumno
            </button>
          )}
        </header>

        {enrollOpen && (
          <div className="border rounded p-4 mb-4 space-y-3 bg-gray-50">
            <div className="flex items-end gap-2">
              <label className="flex-1">
                <span className="text-xs text-gray-600 block mb-1">Alumno</span>
                <select
                  value={enrollStudentId}
                  onChange={(e) => setEnrollStudentId(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm bg-white"
                >
                  {availableStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                      {s.email ? ` (${s.email})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={handleEnroll}
                disabled={enrollSubmitting || !enrollStudentId}
                className="bg-black text-white text-sm px-3 py-2 rounded disabled:opacity-50"
              >
                {enrollSubmitting ? 'Inscribiendo…' : 'Inscribir'}
              </button>
              <button
                onClick={() => {
                  setEnrollOpen(false);
                  setEnrollError(null);
                }}
                className="border text-sm px-3 py-2 rounded"
              >
                Cancelar
              </button>
            </div>
            {enrollError && <p className="text-sm text-red-600">{enrollError}</p>}
          </div>
        )}

        {enrollments.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay alumnos inscritos.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b text-gray-500">
                <th className="py-2 font-medium">Alumno</th>
                <th className="py-2 font-medium">Estado</th>
                <th className="py-2 font-medium">Inscrito</th>
                <th className="py-2 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => {
                const s = studentById[e.studentId];
                const fullName = s ? `${s.firstName} ${s.lastName}` : '(alumno desconocido)';
                return (
                  <tr key={e.id} className="border-b hover:bg-gray-50">
                    <td className="py-2">{fullName}</td>
                    <td className="py-2">
                      <select
                        value={e.status}
                        onChange={(ev) =>
                          handleEnrollmentStatus(e.id, ev.target.value as Enrollment['status'])
                        }
                        className="border rounded px-1 py-0.5 text-xs bg-white"
                      >
                        {(Object.keys(ENROLLMENT_STATUS_LABEL) as Enrollment['status'][]).map(
                          (s) => (
                            <option key={s} value={s}>
                              {ENROLLMENT_STATUS_LABEL[s]}
                            </option>
                          ),
                        )}
                      </select>
                    </td>
                    <td className="py-2 text-gray-600">{e.enrolledAt.slice(0, 10)}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => handleUnenroll(e.id, fullName)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-10">
        <header className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Sesiones</h2>
          {!showSessionForm && (
            <button
              onClick={startCreateSession}
              className="bg-black text-white text-sm px-3 py-2 rounded"
            >
              + Nueva sesión
            </button>
          )}
        </header>

        {showSessionForm && (
          <form
            onSubmit={handleSessionSubmit}
            className="border rounded p-4 mb-4 space-y-3 bg-gray-50"
          >
            <h3 className="text-sm font-medium">
              {editingSession ? 'Editar sesión' : 'Nueva sesión'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-600 block mb-1">Fecha y hora *</span>
                <input
                  type="datetime-local"
                  required
                  value={sessionForm.scheduledAt}
                  onChange={(e) => setSessionForm({ ...sessionForm, scheduledAt: e.target.value })}
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-600 block mb-1">Profesor</span>
                <select
                  value={sessionForm.teacherId}
                  onChange={(e) => setSessionForm({ ...sessionForm, teacherId: e.target.value })}
                  className="w-full border rounded px-2 py-1 text-sm bg-white"
                >
                  <option value="">Sin asignar</option>
                  {allTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block col-span-2">
                <span className="text-xs text-gray-600 block mb-1">Notas</span>
                <textarea
                  value={sessionForm.notes}
                  onChange={(e) => setSessionForm({ ...sessionForm, notes: e.target.value })}
                  rows={2}
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </label>
            </div>
            {sessionError && <p className="text-sm text-red-600">{sessionError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={sessionSubmitting}
                className="bg-black text-white text-sm px-3 py-2 rounded disabled:opacity-50"
              >
                {sessionSubmitting
                  ? 'Guardando…'
                  : editingSession
                    ? 'Guardar cambios'
                    : 'Crear sesión'}
              </button>
              <button
                type="button"
                onClick={cancelSessionForm}
                className="border text-sm px-3 py-2 rounded"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {sessions.length === 0 ? (
          <p className="text-sm text-gray-500">No hay sesiones planificadas.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b text-gray-500">
                <th className="py-2 font-medium">Fecha</th>
                <th className="py-2 font-medium">Profesor</th>
                <th className="py-2 font-medium">Estado</th>
                <th className="py-2 font-medium">Notas</th>
                <th className="py-2 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const t = s.teacherId ? teacherById[s.teacherId] : null;
                return (
                  <tr key={s.id} className="border-b hover:bg-gray-50">
                    <td className="py-2">{formatDateTime(s.scheduledAt)}</td>
                    <td className="py-2 text-gray-600">
                      {t ? `${t.firstName} ${t.lastName}` : '—'}
                    </td>
                    <td className="py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${SESSION_STATUS_STYLE[s.status]}`}
                      >
                        {SESSION_STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    <td className="py-2 text-gray-600 max-w-xs truncate">{s.notes ?? '—'}</td>
                    <td className="py-2 text-right space-x-3">
                      <button
                        onClick={() => startEditSession(s)}
                        className="text-sm hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeleteSession(s)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
