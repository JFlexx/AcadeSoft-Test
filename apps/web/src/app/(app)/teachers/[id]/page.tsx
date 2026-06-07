'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Users2, CalendarDays } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { EmptyState } from '@/components/empty-state';

type Teacher = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  bio: string | null;
  isActive: boolean;
};

type Group = {
  id: string;
  name: string;
  courseId: string;
  teacherId: string | null;
  isActive: boolean;
};
type Course = { id: string; name: string };

type SessionStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
type Session = {
  id: string;
  groupId: string;
  teacherId: string | null;
  scheduledAt: string;
  status: SessionStatus;
};

const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  SCHEDULED: 'Programada',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

const SESSION_STATUS_STYLE: Record<SessionStatus, string> = {
  SCHEDULED: 'bg-gray-100 text-gray-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
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

export default function TeacherDetailPage() {
  const params = useParams<{ id: string }>();
  const teacherId = params.id;

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const t = await api<Teacher>(`/teachers/${teacherId}`);
        setTeacher(t);
        const [g, c, s] = await Promise.all([
          api<Group[]>('/groups'),
          api<Course[]>('/courses'),
          api<Session[]>('/sessions'),
        ]);
        setGroups(g);
        setCourses(c);
        setSessions(s);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

  const courseById = useMemo(
    () => Object.fromEntries(courses.map((c) => [c.id, c])),
    [courses],
  );
  const groupById = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.id, g])),
    [groups],
  );

  // Groups this teacher leads.
  const myGroups = useMemo(
    () => groups.filter((g) => g.teacherId === teacherId),
    [groups, teacherId],
  );
  const myGroupIds = useMemo(() => new Set(myGroups.map((g) => g.id)), [myGroups]);

  // Upcoming sessions where they teach: explicit teacher, or the group's
  // default teacher when the session doesn't override it.
  const upcoming = useMemo(() => {
    const now = Date.now();
    return sessions
      .filter((s) => {
        if (new Date(s.scheduledAt).getTime() < now) return false;
        if (s.status === 'CANCELLED') return false;
        return s.teacherId
          ? s.teacherId === teacherId
          : myGroupIds.has(s.groupId);
      })
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [sessions, teacherId, myGroupIds]);

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
        <p className="text-sm text-gray-500 mb-2">Profesor no encontrado.</p>
        <Link href="/teachers" className="text-sm hover:underline">
          ← Volver a profesores
        </Link>
      </div>
    );
  }

  if (!teacher) return null;

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-3">
        <Link href="/teachers" className="text-sm text-gray-500 hover:underline">
          ← Profesores
        </Link>
      </div>

      <header className="mb-6 flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">
          {teacher.firstName} {teacher.lastName}
        </h1>
        {teacher.isActive ? (
          <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700">
            Activo
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">
            Inactivo
          </span>
        )}
      </header>

      <div className="grid sm:grid-cols-2 gap-6 mb-8">
        <Card title="Datos de contacto">
          <Row label="Email" value={teacher.email ?? '—'} />
          <Row label="Teléfono" value={teacher.phone ?? '—'} />
        </Card>
        <Card title="Bio">
          {teacher.bio ? (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{teacher.bio}</p>
          ) : (
            <p className="text-sm text-gray-500">Sin descripción.</p>
          )}
        </Card>
      </div>

      <section className="mb-10">
        <h2 className="font-medium mb-3">Grupos que imparte</h2>
        {myGroups.length === 0 ? (
          <EmptyState
            icon={Users2}
            title="Sin grupos asignados"
            description="Este profesor todavía no está asignado a ningún grupo."
            action={
              <Link href="/groups" className="btn-primary">
                Ir a grupos
              </Link>
            }
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b text-gray-500">
                <th className="py-2 font-medium">Grupo</th>
                <th className="py-2 font-medium">Curso</th>
                <th className="py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {myGroups.map((g) => (
                <tr key={g.id} className="border-b hover:bg-gray-50">
                  <td className="py-2">
                    <Link href={`/groups/${g.id}`} className="hover:underline">
                      {g.name}
                    </Link>
                  </td>
                  <td className="py-2 text-gray-600">
                    {courseById[g.courseId]?.name ?? '—'}
                  </td>
                  <td className="py-2 text-gray-600">
                    {g.isActive ? 'Activo' : 'Inactivo'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="font-medium mb-3">Próximas sesiones</h2>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Sin sesiones próximas"
            description="No hay sesiones programadas para este profesor de aquí en adelante."
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b text-gray-500">
                <th className="py-2 font-medium">Fecha</th>
                <th className="py-2 font-medium">Grupo</th>
                <th className="py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((s) => (
                <tr key={s.id} className="border-b hover:bg-gray-50">
                  <td className="py-2">
                    <Link href={`/sessions/${s.id}`} className="hover:underline">
                      {formatDateTime(s.scheduledAt)}
                    </Link>
                  </td>
                  <td className="py-2 text-gray-600">
                    {groupById[s.groupId]?.name ?? '—'}
                  </td>
                  <td className="py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${SESSION_STATUS_STYLE[s.status]}`}
                    >
                      {SESSION_STATUS_LABEL[s.status]}
                    </span>
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

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg p-4 bg-white">
      <h2 className="font-medium text-sm text-gray-700 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1 text-sm">
      <span className="text-gray-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}
