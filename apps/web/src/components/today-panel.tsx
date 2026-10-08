'use client';

import Link from 'next/link';
import {
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Inbox,
  RotateCcw,
  Sparkles,
  Users2,
  type LucideIcon,
} from 'lucide-react';
import { formatEur } from '@/lib/format';

export type Today = {
  date: string;
  classes: {
    id: string;
    scheduledAt: string;
    durationMinutes: number;
    status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
    groupName: string;
    teacherName: string | null;
    roomName: string | null;
    enrolled: number;
    marked: number;
  }[];
  attendanceMissing: {
    total: number;
    items: { id: string; scheduledAt: string; groupName: string; teacherName: string | null }[];
  };
  trialsToFollowUp: {
    total: number;
    items: {
      id: string;
      studentName: string;
      groupName: string;
      scheduledAt: string;
      attended: boolean | null;
    }[];
  };
  spotsWithWaitlist: {
    groupId: string;
    groupName: string;
    freeSpots: number;
    waiting: number;
    offered: number;
  }[];
  returnedReceipts: {
    total: number;
    items: {
      id: string;
      invoiceId: string;
      number: string;
      studentName: string;
      amount: string;
      returnedAt: string;
      returnReason: string | null;
    }[];
  };
};

export type PendingRequest = {
  id: string;
  studentName: string;
  groupName: string;
  groupId: string;
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

/** Top of the home screen: today's classes and what the office should close. */
export function TodayPanel({ today, requests }: { today: Today; requests: PendingRequest[] }) {
  const todos = [
    today.attendanceMissing.total > 0 && (
      <Todo
        key="attendance"
        icon={ClipboardCheck}
        title="Pasar lista"
        count={today.attendanceMissing.total}
        hint="Clases ya dadas sin asistencia"
      >
        {today.attendanceMissing.items.map((s) => (
          <Row
            key={s.id}
            href={`/sessions/${s.id}`}
            main={s.groupName}
            side={`${shortDay(s.scheduledAt)} · ${time(s.scheduledAt)}`}
          />
        ))}
      </Todo>
    ),
    requests.length > 0 && (
      <Todo
        key="requests"
        icon={Inbox}
        title="Solicitudes de inscripción"
        count={requests.length}
        hint="Llegadas desde la web"
      >
        {requests.slice(0, 6).map((r) => (
          <Row
            key={r.id}
            href={`/groups/${r.groupId}?tab=students`}
            main={r.studentName}
            side={r.groupName}
          />
        ))}
      </Todo>
    ),
    today.trialsToFollowUp.total > 0 && (
      <Todo
        key="trials"
        icon={Sparkles}
        title="Clases de prueba por seguir"
        count={today.trialsToFollowUp.total}
        hint="Llama para ofrecer la inscripción"
      >
        {today.trialsToFollowUp.items.map((t) => (
          <Row
            key={t.id}
            href="/trials"
            main={t.studentName}
            side={
              t.attended === null
                ? `${t.groupName} · sin marcar si vino`
                : `${t.groupName} · ${t.attended ? 'vino' : 'no vino'}`
            }
          />
        ))}
      </Todo>
    ),
    today.spotsWithWaitlist.length > 0 && (
      <Todo
        key="spots"
        icon={Users2}
        title="Plazas libres con lista de espera"
        count={today.spotsWithWaitlist.length}
        hint="Ofrece la plaza al primero de la lista"
      >
        {today.spotsWithWaitlist.map((g) => (
          <Row
            key={g.groupId}
            href={`/groups/${g.groupId}?tab=students`}
            main={g.groupName}
            side={`${g.freeSpots} libre${g.freeSpots === 1 ? '' : 's'} · ${g.waiting} esperando${g.offered ? ` (${g.offered} avisado${g.offered === 1 ? '' : 's'})` : ''}`}
          />
        ))}
      </Todo>
    ),
    today.returnedReceipts.total > 0 && (
      <Todo
        key="returns"
        icon={RotateCcw}
        title="Recibos devueltos"
        count={today.returnedReceipts.total}
        hint="El banco los devolvió y siguen sin cobrar"
      >
        {today.returnedReceipts.items.map((r) => (
          <Row
            key={r.id}
            href={`/invoices/${r.invoiceId}`}
            main={r.studentName}
            side={formatEur(r.amount)}
            sideTone="amber"
          />
        ))}
      </Todo>
    ),
  ].filter(Boolean);

  return (
    <div className="grid gap-4 lg:grid-cols-5 mb-8">
      <section className="border rounded-xl p-5 bg-white lg:col-span-2 lg:self-start">
        <h2 className="font-medium text-sm text-gray-700 flex items-center gap-1.5 mb-3">
          <CalendarCheck className="h-4 w-4 text-brand-600" />
          Clases de hoy
          {today.classes.length > 0 && (
            <span className="text-gray-400 font-normal">({today.classes.length})</span>
          )}
        </h2>
        {today.classes.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">Hoy no hay clases.</p>
        ) : (
          <ul className="divide-y">
            {today.classes.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/sessions/${c.id}`}
                  className="flex items-center gap-3 py-2 text-sm hover:bg-gray-50 -mx-2 px-2 rounded"
                >
                  <span className="w-12 shrink-0 font-medium tabular-nums">
                    {time(c.scheduledAt)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span
                      className={`block truncate ${c.status === 'CANCELLED' ? 'line-through text-gray-400' : ''}`}
                    >
                      {c.groupName}
                    </span>
                    <span className="block text-xs text-gray-500 truncate">
                      {[c.teacherName, c.roomName].filter(Boolean).join(' · ') ||
                        'Sin profesor asignado'}
                    </span>
                  </span>
                  <ClassState c={c} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="lg:col-span-3 space-y-3">
        {todos.length === 0 ? (
          <div className="border rounded-xl p-5 bg-white flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
            <div>
              <p className="font-medium text-sm">Todo al día</p>
              <p className="text-xs text-gray-500">
                Sin listas por pasar, pruebas por seguir, plazas por ofrecer ni recibos devueltos.
              </p>
            </div>
          </div>
        ) : (
          todos
        )}
      </section>
    </div>
  );
}

function ClassState({ c }: { c: Today['classes'][number] }) {
  const start = new Date(c.scheduledAt).getTime();
  const end = start + c.durationMinutes * 60_000;
  const now = Date.now();
  let label: string;
  let tone: string;
  if (c.status === 'CANCELLED') {
    label = 'Cancelada';
    tone = 'bg-gray-100 text-gray-500';
  } else if (c.marked > 0) {
    label = `Lista ${c.marked}/${c.enrolled}`;
    tone = 'bg-green-50 text-green-700';
  } else if (now >= end) {
    label = 'Sin pasar lista';
    tone = 'bg-amber-50 text-amber-700';
  } else if (now >= start) {
    label = 'En curso';
    tone = 'bg-brand-50 text-brand-700';
  } else {
    label = `${c.enrolled} alumno${c.enrolled === 1 ? '' : 's'}`;
    tone = 'bg-gray-100 text-gray-600';
  }
  return <span className={`shrink-0 text-xs px-2 py-0.5 rounded ${tone}`}>{label}</span>;
}

function Todo({
  icon: Icon,
  title,
  count,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-xl p-4 bg-white">
      <div className="flex items-start gap-2 mb-1">
        <Icon className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-800">
            {title}{' '}
            <span className="ml-1 rounded-full bg-amber-100 text-amber-800 px-1.5 text-xs">
              {count}
            </span>
          </h3>
          <p className="text-xs text-gray-500">{hint}</p>
        </div>
      </div>
      <ul className="divide-y ml-6">{children}</ul>
    </div>
  );
}

function Row({
  href,
  main,
  side,
  sideTone,
}: {
  href: string;
  main: string;
  side: string;
  sideTone?: 'amber';
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-3 py-1.5 text-sm hover:bg-gray-50 -mx-2 px-2 rounded"
      >
        <span className="min-w-0 truncate">{main}</span>
        <span
          className={`shrink-0 text-xs ${sideTone === 'amber' ? 'text-amber-700 font-medium' : 'text-gray-500'}`}
        >
          {side}
        </span>
      </Link>
    </li>
  );
}
