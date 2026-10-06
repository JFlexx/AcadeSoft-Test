'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/empty-state';

type TeacherSession = {
  id: string;
  scheduledAt: string;
  durationMinutes: number | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  group: { id: string; name: string; course: { name: string; color: string | null } };
  enrolled: number;
  trials: number;
  marked: number;
};

const DEFAULT_COLOR = '#6366f1';
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const time = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

function dayLabel(day: Date, today: Date): string {
  const diff = Math.round((startOfDay(day).getTime() - today.getTime()) / DAY_MS);
  const date = day.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  if (diff === 0) return `Hoy · ${date}`;
  if (diff === 1) return `Mañana · ${date}`;
  return date.charAt(0).toUpperCase() + date.slice(1);
}

export default function TeacherHomePage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [sessions, setSessions] = useState<TeacherSession[]>([]);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => startOfDay(new Date()), []);
  const from = addDays(today, weekOffset * 7);
  const to = addDays(from, 7);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    api<TeacherSession[]>(`/teacher/sessions?${qs}`)
      .then(setSessions)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  const byDay = useMemo(() => {
    const map = new Map<number, TeacherSession[]>();
    for (const s of sessions) {
      const key = startOfDay(new Date(s.scheduledAt)).getTime();
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [sessions]);

  const now = Date.now();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Mis clases</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-2 rounded hover:bg-gray-100"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="text-sm px-2 py-1 rounded hover:bg-gray-100">
              Hoy
            </button>
          )}
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="p-2 rounded hover:bg-gray-100"
            aria-label="Semana siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500 -mt-3">
        {from.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} –{' '}
        {addDays(to, -1).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : byDay.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Sin clases esta semana"
          description="Cuando la academia te asigne clases aparecerán aquí."
        />
      ) : (
        byDay.map(([key, list]) => (
          <section key={key}>
            <h2 className="text-sm font-medium text-gray-700 mb-2">
              {dayLabel(new Date(key), today)}
            </h2>
            <ul className="space-y-2">
              {list.map((s) => {
                const start = new Date(s.scheduledAt);
                const end = new Date(start.getTime() + (s.durationMinutes ?? 60) * 60_000);
                const live = start.getTime() <= now && now < end.getTime();
                const cancelled = s.status === 'CANCELLED';
                const done = s.enrolled + s.trials > 0 && s.marked >= s.enrolled + s.trials;
                return (
                  <li key={s.id}>
                    <Link
                      href={`/teacher/sessions/${s.id}`}
                      className={`flex items-center gap-3 rounded-xl border bg-white p-3 hover:bg-gray-50 ${
                        live ? 'ring-2 ring-brand-500' : ''
                      } ${cancelled ? 'opacity-60' : ''}`}
                      style={{ borderLeft: `4px solid ${s.group.course.color ?? DEFAULT_COLOR}` }}
                    >
                      <div className="w-14 shrink-0 text-center">
                        <p className="font-semibold">{time(start)}</p>
                        <p className="text-xs text-gray-500">{time(end)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium truncate ${cancelled ? 'line-through' : ''}`}>
                          {s.group.name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {s.group.course.name} · {s.enrolled} alumnos
                          {s.trials > 0 && (
                            <span className="text-amber-700"> · {s.trials} de prueba</span>
                          )}
                          {live && <span className="text-brand-700 font-medium"> · Ahora</span>}
                        </p>
                      </div>
                      {cancelled ? (
                        <span className="text-xs text-gray-500">Cancelada</span>
                      ) : done ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                          <CheckCircle2 className="h-4 w-4" /> Lista pasada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
                          <ClipboardList className="h-4 w-4" />
                          {s.marked > 0 ? `${s.marked}/${s.enrolled + s.trials}` : 'Pasar lista'}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
