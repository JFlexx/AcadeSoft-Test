'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Receipt,
  CalendarDays,
  LayoutDashboard,
  Inbox,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type Student = { id: string; firstName: string; lastName: string; isActive: boolean };
type Group = {
  id: string;
  name: string;
  maxCapacity: number | null;
  isActive: boolean;
};
type Invoice = {
  id: string;
  number: string;
  studentId: string;
  amount: string;
  paidAmount: string;
  status: string;
  issueDate: string;
};
type Session = { scheduledAt: string; status: string };
type Enrollment = {
  id: string;
  studentId: string;
  groupId: string;
  status: string;
};

type Stats = {
  activeStudents: number;
  activeGroups: number;
  monthlyBilled: number;
  monthlyCollected: number;
  sessionsThisWeek: number;
  pendingInvoices: number;
};

type PendingPayment = {
  id: string;
  number: string;
  studentName: string;
  pending: number;
  issueDate: string;
};
type PendingRequest = {
  id: string;
  studentName: string;
  groupName: string;
  groupId: string;
};
type Occupancy = {
  groupId: string;
  name: string;
  active: number;
  capacity: number;
};

type Data = {
  stats: Stats;
  pendingPayments: PendingPayment[];
  pendingPaymentsTotal: number;
  pendingRequests: PendingRequest[];
  occupancy: Occupancy[];
};

function startOfMonth(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
}

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function endOfWeek(): Date {
  const mon = startOfWeek();
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 7);
  return sun;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [students, groups, invoices, sessions, enrollments] =
          await Promise.all([
            api<Student[]>('/students'),
            api<Group[]>('/groups'),
            api<Invoice[]>('/invoices'),
            api<Session[]>('/sessions'),
            api<Enrollment[]>('/enrollments'),
          ]);

        const monthStart = startOfMonth();
        const weekStart = startOfWeek();
        const weekEnd = endOfWeek();

        const studentName = (id: string) => {
          const s = students.find((x) => x.id === id);
          return s ? `${s.firstName} ${s.lastName}` : '—';
        };
        const groupName = (id: string) =>
          groups.find((g) => g.id === id)?.name ?? '—';

        const monthInvoices = invoices.filter(
          (i) => i.status !== 'CANCELLED' && new Date(i.issueDate) >= monthStart,
        );

        const stats: Stats = {
          activeStudents: students.filter((s) => s.isActive).length,
          activeGroups: groups.filter((g) => g.isActive).length,
          monthlyBilled: monthInvoices.reduce((s, i) => s + Number(i.amount), 0),
          monthlyCollected: monthInvoices.reduce(
            (s, i) => s + Number(i.paidAmount),
            0,
          ),
          sessionsThisWeek: sessions.filter((s) => {
            const d = new Date(s.scheduledAt);
            return d >= weekStart && d < weekEnd && s.status !== 'CANCELLED';
          }).length,
          pendingInvoices: invoices.filter(
            (i) =>
              i.status === 'PENDING' ||
              i.status === 'PARTIAL' ||
              i.status === 'OVERDUE',
          ).length,
        };

        const unpaid = invoices
          .filter(
            (i) =>
              i.status === 'PENDING' ||
              i.status === 'PARTIAL' ||
              i.status === 'OVERDUE',
          )
          .map((i) => ({
            id: i.id,
            number: i.number,
            studentName: studentName(i.studentId),
            pending: Number(i.amount) - Number(i.paidAmount),
            issueDate: i.issueDate,
          }))
          .filter((p) => p.pending > 0)
          .sort((a, b) => a.issueDate.localeCompare(b.issueDate));

        const pendingRequests = enrollments
          .filter((e) => e.status === 'PENDING')
          .map((e) => ({
            id: e.id,
            studentName: studentName(e.studentId),
            groupName: groupName(e.groupId),
            groupId: e.groupId,
          }));

        const activeByGroup = new Map<string, number>();
        for (const e of enrollments) {
          if (e.status === 'ACTIVE')
            activeByGroup.set(e.groupId, (activeByGroup.get(e.groupId) ?? 0) + 1);
        }
        const occupancy = groups
          .filter((g) => g.isActive && g.maxCapacity != null)
          .map((g) => ({
            groupId: g.id,
            name: g.name,
            active: activeByGroup.get(g.id) ?? 0,
            capacity: g.maxCapacity as number,
          }))
          .sort((a, b) => b.active / b.capacity - a.active / a.capacity);

        setData({
          stats,
          pendingPayments: unpaid.slice(0, 6),
          pendingPaymentsTotal: unpaid.reduce((s, p) => s + p.pending, 0),
          pendingRequests,
          occupancy,
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const now = new Date();
  const monthName = now.toLocaleString('es-ES', { month: 'long' });

  return (
    <div className="p-6 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Hola, {user?.firstName} 👋</h1>
        <p className="text-sm text-gray-500 mt-1">
          {now.toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </header>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border rounded-xl p-5 bg-white animate-pulse h-28" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-8">
            <StatCard icon={Users} label="Alumnos activos" value={data.stats.activeStudents} href="/students" />
            <StatCard icon={LayoutDashboard} label="Grupos activos" value={data.stats.activeGroups} href="/groups" />
            <StatCard icon={CalendarDays} label="Sesiones esta semana" value={data.stats.sessionsThisWeek} href="/calendar" />
            <StatCard icon={Receipt} label={`Facturado en ${monthName}`} value={formatMoney(data.stats.monthlyBilled, 0)} href="/invoices" isText />
            <StatCard icon={Receipt} label={`Cobrado en ${monthName}`} value={formatMoney(data.stats.monthlyCollected, 0)} href="/invoices" isText tone="green" />
            <StatCard icon={Receipt} label="Facturas pendientes" value={data.stats.pendingInvoices} href="/invoices" tone={data.stats.pendingInvoices > 0 ? 'amber' : 'gray'} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 mb-8">
            <Panel
              title="Cobros pendientes"
              subtitle={
                data.pendingPayments.length > 0
                  ? `${formatMoney(data.pendingPaymentsTotal)} por cobrar`
                  : undefined
              }
            >
              {data.pendingPayments.length === 0 ? (
                <Empty>Todo cobrado 🎉</Empty>
              ) : (
                <ul className="divide-y">
                  {data.pendingPayments.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/invoices/${p.id}`}
                        className="flex items-center justify-between py-2 text-sm hover:bg-gray-50 -mx-2 px-2 rounded"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{p.studentName}</span>
                          <span className="text-xs text-gray-400 font-mono">
                            {p.number}
                          </span>
                        </span>
                        <span className="text-amber-700 font-medium shrink-0">
                          {formatMoney(p.pending)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title="Solicitudes de inscripción"
              subtitle={
                data.pendingRequests.length > 0
                  ? `${data.pendingRequests.length} pendiente(s) de aprobar`
                  : undefined
              }
              icon={Inbox}
            >
              {data.pendingRequests.length === 0 ? (
                <Empty>Sin solicitudes nuevas.</Empty>
              ) : (
                <ul className="divide-y">
                  {data.pendingRequests.slice(0, 6).map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/groups/${r.groupId}`}
                        className="flex items-center justify-between py-2 text-sm hover:bg-gray-50 -mx-2 px-2 rounded"
                      >
                        <span className="min-w-0 truncate">{r.studentName}</span>
                        <span className="text-xs text-gray-500 shrink-0">
                          {r.groupName}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {data.occupancy.length > 0 && (
            <div className="border rounded-xl p-5 bg-white mb-8">
              <h2 className="font-medium text-sm text-gray-700 mb-3">
                Ocupación de grupos
              </h2>
              <div className="space-y-2.5">
                {data.occupancy.map((o) => {
                  const pct = Math.round((o.active / o.capacity) * 100);
                  const full = o.active >= o.capacity;
                  return (
                    <Link
                      key={o.groupId}
                      href={`/groups/${o.groupId}`}
                      className="block group"
                    >
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="group-hover:text-brand-700">{o.name}</span>
                        <span className="text-xs text-gray-500">
                          {o.active}/{o.capacity}
                          {full && ' · completo'}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${full ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-brand-500'}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border rounded-xl p-5 bg-white">
            <h2 className="font-medium text-sm text-gray-700 mb-3">Accesos rápidos</h2>
            <div className="flex flex-wrap gap-2">
              <QuickLink href="/students" label="+ Nuevo alumno" />
              <QuickLink href="/invoices" label="+ Nueva factura" />
              <QuickLink href="/billing" label="Generar mensualidades" />
              <QuickLink href="/settings" label="Ajustes de la academia" />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function formatMoney(value: number, decimals = 2): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: decimals,
  }).format(value);
}

function Panel({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-xl p-5 bg-white">
      <div className="mb-3">
        <h2 className="font-medium text-sm text-gray-700 flex items-center gap-1.5">
          {Icon && <Icon className="h-4 w-4 text-brand-600" />}
          {title}
        </h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 py-2">{children}</p>;
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  isText = false,
  tone = 'gray',
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  href: string;
  isText?: boolean;
  tone?: 'gray' | 'green' | 'amber';
}) {
  const valueColor =
    tone === 'green'
      ? 'text-green-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : 'text-gray-900';

  return (
    <Link
      href={href}
      className="border rounded-xl p-5 bg-white hover:border-brand-200 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-brand-600" />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p
        className={`font-semibold group-hover:text-brand-700 transition-colors ${isText ? 'text-xl' : 'text-3xl'} ${valueColor}`}
      >
        {value}
      </p>
    </Link>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-sm px-3 py-1.5 border rounded-lg hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-colors"
    >
      {label}
    </Link>
  );
}
