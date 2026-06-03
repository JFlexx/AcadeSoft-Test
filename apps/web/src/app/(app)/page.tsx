'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Receipt,
  CalendarDays,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type Student = { isActive: boolean };
type Group = { isActive: boolean };
type Invoice = {
  amount: string;
  paidAmount: string;
  status: string;
  issueDate: string;
};
type Session = { scheduledAt: string; status: string };

type Stats = {
  activeStudents: number;
  activeGroups: number;
  monthlyBilled: number;
  monthlyCollected: number;
  sessionsThisWeek: number;
  pendingInvoices: number;
};

function startOfMonth(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
}

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // Monday
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
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [students, groups, invoices, sessions] = await Promise.all([
          api<Student[]>('/students'),
          api<Group[]>('/groups'),
          api<Invoice[]>('/invoices'),
          api<Session[]>('/sessions'),
        ]);

        const now = startOfMonth();
        const weekStart = startOfWeek();
        const weekEnd = endOfWeek();

        const activeStudents = students.filter((s) => s.isActive).length;
        const activeGroups = groups.filter((g) => g.isActive).length;

        const monthInvoices = invoices.filter(
          (i) =>
            i.status !== 'CANCELLED' &&
            new Date(i.issueDate) >= now,
        );
        const monthlyBilled = monthInvoices.reduce(
          (sum, i) => sum + Number(i.amount),
          0,
        );
        const monthlyCollected = monthInvoices.reduce(
          (sum, i) => sum + Number(i.paidAmount),
          0,
        );
        const pendingInvoices = invoices.filter(
          (i) => i.status === 'PENDING' || i.status === 'PARTIAL' || i.status === 'OVERDUE',
        ).length;

        const sessionsThisWeek = sessions.filter((s) => {
          const d = new Date(s.scheduledAt);
          return d >= weekStart && d < weekEnd && s.status !== 'CANCELLED';
        }).length;

        setStats({
          activeStudents,
          activeGroups,
          monthlyBilled,
          monthlyCollected,
          sessionsThisWeek,
          pendingInvoices,
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
        <h1 className="text-xl font-semibold">
          Hola, {user?.firstName} 👋
        </h1>
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
            <div
              key={i}
              className="border rounded-xl p-5 bg-white animate-pulse h-28"
            />
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-8">
            <StatCard
              icon={Users}
              label="Alumnos activos"
              value={stats.activeStudents}
              href="/students"
            />
            <StatCard
              icon={LayoutDashboard}
              label="Grupos activos"
              value={stats.activeGroups}
              href="/groups"
            />
            <StatCard
              icon={CalendarDays}
              label="Sesiones esta semana"
              value={stats.sessionsThisWeek}
              href="/groups"
            />
            <StatCard
              icon={Receipt}
              label={`Facturado en ${monthName}`}
              value={formatEur(stats.monthlyBilled)}
              href="/invoices"
              isText
            />
            <StatCard
              icon={Receipt}
              label={`Cobrado en ${monthName}`}
              value={formatEur(stats.monthlyCollected)}
              href="/invoices"
              isText
              tone="green"
            />
            <StatCard
              icon={Receipt}
              label="Facturas pendientes"
              value={stats.pendingInvoices}
              href="/invoices?status=PENDING"
              tone={stats.pendingInvoices > 0 ? 'amber' : 'gray'}
            />
          </div>

          <div className="border rounded-xl p-5 bg-white">
            <h2 className="font-medium text-sm text-gray-700 mb-3">
              Accesos rápidos
            </h2>
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

function formatEur(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
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
