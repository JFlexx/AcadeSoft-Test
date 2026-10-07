'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CalendarDays, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/empty-state';
import { downloadIcs } from '@/lib/ics';

type SessionStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
type Session = {
  id: string;
  groupId: string;
  teacherId: string | null;
  scheduledAt: string;
  status: SessionStatus;
  durationMinutes: number | null;
  roomId: string | null;
};
type Holiday = { id: string; name: string; startDate: string; endDate: string };
type Group = {
  id: string;
  name: string;
  courseId: string;
  teacherId: string | null;
  roomId: string | null;
};
type Room = { id: string; name: string };
type Conflict = {
  room: Room;
  a: { sessionId: string; group: { name: string }; start: string };
  b: { sessionId: string; group: { name: string }; start: string };
};
type Course = { id: string; name: string; color: string | null };
type Teacher = { id: string; firstName: string; lastName: string };

type ViewMode = 'week' | 'month';

const DEFAULT_COLOR = '#6366f1';
const DEFAULT_DURATION = 60;
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// ─── date helpers (local time) ──────────────────────────────────────────────

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sessionEnd(s: Session): Date {
  return new Date(new Date(s.scheduledAt).getTime() + (s.durationMinutes ?? DEFAULT_DURATION) * 60_000);
}

/** Local calendar date as "YYYY-MM-DD" (holidays are stored that way). */
function ymd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ─── page ───────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [filterRoom, setFilterRoom] = useState('');
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [filterGroup, setFilterGroup] = useState('');
  const [filterTeacher, setFilterTeacher] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [s, g, c, t, h, r] = await Promise.all([
          api<Session[]>('/sessions'),
          api<Group[]>('/groups'),
          api<Course[]>('/courses'),
          api<Teacher[]>('/teachers'),
          api<Holiday[]>('/holidays'),
          api<Room[]>('/rooms'),
        ]);
        setHolidays(h);
        setRooms(r);
        setSessions(s);
        setGroups(g);
        setCourses(c);
        setTeachers(t);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const groupById = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.id, g])),
    [groups],
  );
  const courseById = useMemo(
    () => Object.fromEntries(courses.map((c) => [c.id, c])),
    [courses],
  );
  const teacherById = useMemo(
    () => Object.fromEntries(teachers.map((t) => [t.id, t])),
    [teachers],
  );

  function holidayFor(day: Date): string | null {
    const d = ymd(day);
    return holidays.find((h) => h.startDate <= d && d <= h.endDate)?.name ?? null;
  }

  function roomOf(session: Session): Room | null {
    const id = session.roomId ?? groupById[session.groupId]?.roomId ?? null;
    return id ? (rooms.find((r) => r.id === id) ?? null) : null;
  }

  function colorFor(session: Session): string {
    const group = groupById[session.groupId];
    const course = group ? courseById[group.courseId] : null;
    return course?.color ?? DEFAULT_COLOR;
  }

  function teacherFor(session: Session): string | null {
    const id = session.teacherId ?? groupById[session.groupId]?.teacherId ?? null;
    if (!id) return null;
    const t = teacherById[id];
    return t ? `${t.firstName} ${t.lastName}` : null;
  }

  const filtered = useMemo(
    () =>
      sessions.filter((s) => {
        if (filterGroup && s.groupId !== filterGroup) return false;
        if (filterRoom && roomOf(s)?.id !== filterRoom) return false;
        if (filterTeacher) {
          const id = s.teacherId ?? groupById[s.groupId]?.teacherId ?? null;
          if (id !== filterTeacher) return false;
        }
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, filterGroup, filterTeacher, filterRoom, groupById, rooms],
  );

  // Bucket sessions by local day, each bucket sorted by time.
  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of filtered) {
      const key = dayKey(new Date(s.scheduledAt));
      const list = map.get(key);
      if (list) list.push(s);
      else map.set(key, [s]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    }
    return map;
  }, [filtered]);

  // Room clashes in the visible period (week or month).
  useEffect(() => {
    if (rooms.length === 0) {
      setConflicts([]);
      return;
    }
    const first = view === 'week' ? startOfWeek(anchor) : new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = view === 'week' ? addDays(first, 6) : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    api<Conflict[]>(`/rooms/conflicts?from=${fmt(first)}&to=${fmt(last)}`)
      .then(setConflicts)
      .catch(() => setConflicts([]));
  }, [anchor, view, rooms.length]);

  function go(delta: number) {
    setAnchor((prev) => (view === 'week' ? addDays(prev, delta * 7) : addMonths(prev, delta)));
  }

  function handleExportIcs() {
    const events = filtered.map((s) => {
      const start = new Date(s.scheduledAt);
      const end = sessionEnd(s);
      const teacher = teacherFor(s);
      return {
        uid: `${s.id}@acadesoft`,
        start,
        end,
        summary: groupById[s.groupId]?.name ?? 'Sesión',
        description: teacher ? `Profesor: ${teacher}` : undefined,
        cancelled: s.status === 'CANCELLED',
      };
    });
    downloadIcs(
      `calendario-${new Date().toISOString().slice(0, 10)}.ics`,
      events,
    );
  }

  const periodLabel =
    view === 'week' ? weekLabel(anchor) : monthLabel(anchor);

  return (
    <div className="p-6 max-w-6xl">
      <header className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Calendario</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportIcs}
            disabled={filtered.length === 0}
            className="btn-secondary"
            title="Exportar las sesiones a un archivo .ics (Google/Apple Calendar)"
          >
            <Download className="h-4 w-4" />
            Exportar .ics
          </button>
          <div className="inline-flex rounded-md border bg-white overflow-hidden">
            <ViewTab label="Semana" active={view === 'week'} onClick={() => setView('week')} />
            <ViewTab label="Mes" active={view === 'month'} onClick={() => setView('month')} />
          </div>
        </div>
      </header>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => go(-1)} className="btn-secondary !px-2" aria-label="Anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setAnchor(new Date())} className="btn-secondary">
            Hoy
          </button>
          <button onClick={() => go(1)} className="btn-secondary !px-2" aria-label="Siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-gray-700 ml-1 capitalize">
            {periodLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-white"
          >
            <option value="">Todos los grupos</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {rooms.length > 0 && (
            <select
              value={filterRoom}
              onChange={(e) => setFilterRoom(e.target.value)}
              className="border rounded px-2 py-1 text-sm bg-white"
            >
              <option value="">Todas las aulas</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={filterTeacher}
            onChange={(e) => setFilterTeacher(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-white"
          >
            <option value="">Todos los profesores</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.firstName} {t.lastName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">
            {conflicts.length === 1 ? '1 conflicto de aula' : `${conflicts.length} conflictos de aula`} en este
            periodo
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {conflicts.slice(0, 5).map((c) => (
              <li key={c.a.sessionId + c.b.sessionId}>
                {c.room.name}: {c.a.group.name} y {c.b.group.name} el{' '}
                {new Date(c.b.start).toLocaleString('es-ES', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No hay sesiones programadas"
          description="Crea sesiones dentro de un grupo para verlas aquí en el calendario."
          action={
            <Link href="/groups" className="btn-primary">
              Ir a grupos
            </Link>
          }
        />
      ) : view === 'week' ? (
        <WeekView
          anchor={anchor}
          byDay={byDay}
          groupById={groupById}
          colorFor={colorFor}
          teacherFor={teacherFor}
          holidayFor={holidayFor}
          roomFor={(s) => roomOf(s)?.name ?? null}
        />
      ) : (
        <MonthView
          anchor={anchor}
          byDay={byDay}
          groupById={groupById}
          colorFor={colorFor}
          holidayFor={holidayFor}
        />
      )}
    </div>
  );
}

// ─── week view ──────────────────────────────────────────────────────────────

function WeekView({
  anchor,
  byDay,
  groupById,
  colorFor,
  teacherFor,
  holidayFor,
  roomFor,
}: {
  anchor: Date;
  byDay: Map<string, Session[]>;
  groupById: Record<string, Group>;
  colorFor: (s: Session) => string;
  teacherFor: (s: Session) => string | null;
  holidayFor: (day: Date) => string | null;
  roomFor: (s: Session) => string | null;
}) {
  const monday = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const today = new Date();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {days.map((day, i) => {
        const list = byDay.get(dayKey(day)) ?? [];
        const isToday = isSameDay(day, today);
        const holiday = holidayFor(day);
        return (
          <div
            key={i}
            className={`border rounded-lg min-h-[8rem] flex flex-col ${holiday ? 'bg-amber-50' : 'bg-white'}`}
          >
            <div
              className={`px-2 py-1.5 border-b text-xs font-medium flex items-center justify-between ${
                isToday ? 'bg-brand-50 text-brand-700' : 'text-gray-600'
              }`}
            >
              <span>{WEEKDAYS[i]}</span>
              <span className={isToday ? 'font-semibold' : ''}>{day.getDate()}</span>
            </div>
            {holiday && (
              <p className="px-2 pt-1 text-[11px] font-medium text-amber-700 truncate" title={holiday}>
                {holiday}
              </p>
            )}
            <div className="p-1.5 space-y-1.5 flex-1">
              {list.length === 0 ? (
                <p className="text-[11px] text-gray-300 px-1 py-2">—</p>
              ) : (
                list.map((s) => (
                  <SessionChip
                    key={s.id}
                    session={s}
                    color={colorFor(s)}
                    groupName={groupById[s.groupId]?.name ?? 'Grupo'}
                    teacher={teacherFor(s)}
                    room={roomFor(s)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SessionChip({
  session,
  color,
  groupName,
  teacher,
  room,
}: {
  session: Session;
  color: string;
  groupName: string;
  teacher: string | null;
  room: string | null;
}) {
  const cancelled = session.status === 'CANCELLED';
  return (
    <Link
      href={`/sessions/${session.id}`}
      className={`block rounded px-1.5 py-1 text-[11px] leading-tight hover:brightness-95 transition ${
        cancelled ? 'opacity-50' : ''
      }`}
      style={{ borderLeft: `3px solid ${color}`, backgroundColor: `${color}1a` }}
    >
      <span className={`font-medium text-gray-800 ${cancelled ? 'line-through' : ''}`}>
        {formatTime(session.scheduledAt)}–{formatTime(sessionEnd(session).toISOString())} ·{' '}
        {groupName}
      </span>
      {(teacher || room) && (
        <span className="block text-gray-500 truncate">{[teacher, room].filter(Boolean).join(' · ')}</span>
      )}
    </Link>
  );
}

// ─── month view ─────────────────────────────────────────────────────────────

function MonthView({
  anchor,
  byDay,
  groupById,
  colorFor,
  holidayFor,
}: {
  anchor: Date;
  byDay: Map<string, Session[]>;
  groupById: Record<string, Group>;
  colorFor: (s: Session) => string;
  holidayFor: (day: Date) => string | null;
}) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)); // 6 weeks
  const today = new Date();
  const currentMonth = anchor.getMonth();

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-1.5 text-xs font-medium text-gray-500 text-center">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const list = byDay.get(dayKey(day)) ?? [];
          const inMonth = day.getMonth() === currentMonth;
          const isToday = isSameDay(day, today);
          const holiday = holidayFor(day);
          return (
            <div
              key={i}
              className={`min-h-[6rem] border-b border-r p-1 ${
                holiday ? 'bg-amber-50' : inMonth ? '' : 'bg-gray-50/60'
              } ${i % 7 === 6 ? 'border-r-0' : ''}`}
              title={holiday ?? undefined}
            >
              <div
                className={`text-[11px] mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full ${
                  isToday
                    ? 'bg-brand-600 text-white font-semibold'
                    : inMonth
                      ? 'text-gray-700'
                      : 'text-gray-400'
                }`}
              >
                {day.getDate()}
              </div>
              {holiday && (
                <p className="text-[10px] font-medium text-amber-700 truncate px-1">{holiday}</p>
              )}
              <div className="space-y-0.5">
                {list.slice(0, 3).map((s) => (
                  <Link
                    key={s.id}
                    href={`/sessions/${s.id}`}
                    className={`block rounded px-1 py-0.5 text-[10px] leading-tight truncate hover:brightness-95 ${
                      s.status === 'CANCELLED' ? 'opacity-50 line-through' : ''
                    }`}
                    style={{
                      backgroundColor: `${colorFor(s)}1a`,
                      borderLeft: `2px solid ${colorFor(s)}`,
                    }}
                    title={`${formatTime(s.scheduledAt)} · ${groupById[s.groupId]?.name ?? ''}`}
                  >
                    {formatTime(s.scheduledAt)} {groupById[s.groupId]?.name ?? ''}
                  </Link>
                ))}
                {list.length > 3 && (
                  <span className="block text-[10px] text-gray-400 px-1">
                    +{list.length - 3} más
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── small bits ─────────────────────────────────────────────────────────────

function ViewTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm transition-colors ${
        active ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );
}

function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

function weekLabel(anchor: Date): string {
  const monday = startOfWeek(anchor);
  const sunday = addDays(monday, 6);
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const fmt = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString('es-ES', {
      day: 'numeric',
      ...(withMonth ? { month: 'short' } : {}),
      ...(monday.getFullYear() !== sunday.getFullYear() ? { year: 'numeric' } : {}),
    });
  return `${fmt(monday, !sameMonth)} – ${fmt(sunday, true)} ${sunday.getFullYear()}`;
}

function monthLabel(anchor: Date): string {
  return anchor.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}
