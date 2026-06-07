'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Users2, Receipt } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { EmptyState } from '@/components/empty-state';

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  address: string | null;
  notes: string | null;
  iban: string | null;
  mandateReference: string | null;
  mandateDate: string | null;
  isActive: boolean;
};

type EnrollmentStatus = 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'DROPPED';
type Enrollment = {
  id: string;
  studentId: string;
  groupId: string;
  status: EnrollmentStatus;
  monthlyFeeOverride: string | null;
};

type Group = {
  id: string;
  name: string;
  courseId: string;
  monthlyFee: string | null;
};
type Course = { id: string; name: string };

type InvoiceStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'PARTIAL'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';
type Invoice = {
  id: string;
  studentId: string;
  number: string;
  amount: string;
  paidAmount: string;
  issueDate: string;
  status: InvoiceStatus;
  type: 'ORIGINAL' | 'RECTIFICATIVA';
};

const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  ACTIVE: 'Activo',
  PENDING: 'Pendiente',
  COMPLETED: 'Completado',
  DROPPED: 'Baja',
};

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Borrador',
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Cobrada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Anulada',
};

const INVOICE_STATUS_STYLE: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING: 'bg-amber-50 text-amber-700',
  PARTIAL: 'bg-blue-50 text-blue-700',
  PAID: 'bg-green-50 text-green-700',
  OVERDUE: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500 line-through',
};

function formatEur(value: string | number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value));
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES');
}

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const studentId = params.id;

  const [student, setStudent] = useState<Student | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const s = await api<Student>(`/students/${studentId}`);
        setStudent(s);
        const [enr, g, c, inv] = await Promise.all([
          api<Enrollment[]>(`/enrollments?studentId=${studentId}`),
          api<Group[]>('/groups'),
          api<Course[]>('/courses'),
          api<Invoice[]>('/invoices'),
        ]);
        setEnrollments(enr);
        setGroups(g);
        setCourses(c);
        setInvoices(inv.filter((i) => i.studentId === studentId));
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const groupById = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.id, g])),
    [groups],
  );
  const courseById = useMemo(
    () => Object.fromEntries(courses.map((c) => [c.id, c])),
    [courses],
  );

  const totals = useMemo(() => {
    let billed = 0;
    let collected = 0;
    for (const i of invoices) {
      if (i.status === 'CANCELLED') continue;
      billed += Number(i.amount);
      collected += Number(i.paidAmount);
    }
    return { billed, collected, pending: billed - collected };
  }, [invoices]);

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
        <p className="text-sm text-gray-500 mb-2">Alumno no encontrado.</p>
        <Link href="/students" className="text-sm hover:underline">
          ← Volver a alumnos
        </Link>
      </div>
    );
  }

  if (!student) return null;

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-3">
        <Link href="/students" className="text-sm text-gray-500 hover:underline">
          ← Alumnos
        </Link>
      </div>

      <header className="mb-6 flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">
          {student.firstName} {student.lastName}
        </h1>
        {student.isActive ? (
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
          <Row label="Email" value={student.email ?? '—'} />
          <Row label="Teléfono" value={student.phone ?? '—'} />
          <Row label="Fecha de nacimiento" value={formatDate(student.birthDate)} />
          <Row label="Dirección" value={student.address ?? '—'} />
        </Card>

        <Card title="Domiciliación SEPA">
          {student.iban ? (
            <>
              <Row label="IBAN" value={student.iban} mono />
              <Row label="Ref. mandato" value={student.mandateReference ?? '—'} />
              <Row label="Fecha mandato" value={formatDate(student.mandateDate)} />
            </>
          ) : (
            <p className="text-sm text-gray-500">
              Sin domiciliación configurada. Añádela editando el alumno para
              incluirlo en las remesas SEPA.
            </p>
          )}
        </Card>
      </div>

      {student.notes && (
        <Card title="Notas" className="mb-8">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{student.notes}</p>
        </Card>
      )}

      <section className="mb-10">
        <h2 className="font-medium mb-3">Grupos</h2>
        {enrollments.length === 0 ? (
          <EmptyState
            icon={Users2}
            title="Sin inscripciones"
            description="Este alumno todavía no está inscrito en ningún grupo."
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
                <th className="py-2 font-medium text-right">Cuota/mes</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => {
                const g = groupById[e.groupId];
                const fee = e.monthlyFeeOverride ?? g?.monthlyFee ?? null;
                return (
                  <tr key={e.id} className="border-b hover:bg-gray-50">
                    <td className="py-2">
                      {g ? (
                        <Link href={`/groups/${g.id}`} className="hover:underline">
                          {g.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 text-gray-600">
                      {g ? (courseById[g.courseId]?.name ?? '—') : '—'}
                    </td>
                    <td className="py-2 text-gray-600">
                      {ENROLLMENT_STATUS_LABEL[e.status]}
                    </td>
                    <td className="py-2 text-right text-gray-600">
                      {fee !== null ? formatEur(fee) : '—'}
                      {e.monthlyFeeOverride && (
                        <span className="text-xs text-gray-400 ml-1">(personal.)</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="font-medium mb-3">Facturas</h2>
        {invoices.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Sin facturas"
            description="Este alumno todavía no tiene facturas emitidas."
            action={
              <Link href="/invoices" className="btn-primary">
                Ir a facturas
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <SummaryCard label="Facturado" value={formatEur(totals.billed)} />
              <SummaryCard
                label="Cobrado"
                value={formatEur(totals.collected)}
                tone="green"
              />
              <SummaryCard
                label="Pendiente"
                value={formatEur(totals.pending)}
                tone={totals.pending > 0 ? 'amber' : 'gray'}
              />
            </div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b text-gray-500">
                  <th className="py-2 font-medium">Nº</th>
                  <th className="py-2 font-medium">Fecha</th>
                  <th className="py-2 font-medium text-right">Importe</th>
                  <th className="py-2 font-medium text-right">Pendiente</th>
                  <th className="py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => {
                  const pending = Number(i.amount) - Number(i.paidAmount);
                  return (
                    <tr key={i.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 font-mono text-xs">
                        <Link
                          href={`/invoices/${i.id}`}
                          className="text-brand-700 hover:underline"
                        >
                          {i.number}
                        </Link>
                      </td>
                      <td className="py-2 text-gray-600">{formatDate(i.issueDate)}</td>
                      <td className="py-2 text-right">{formatEur(i.amount)}</td>
                      <td className="py-2 text-right">
                        {i.status === 'CANCELLED' ? '—' : formatEur(pending)}
                      </td>
                      <td className="py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${INVOICE_STATUS_STYLE[i.status]}`}
                        >
                          {INVOICE_STATUS_LABEL[i.status]}
                        </span>
                        {i.type === 'RECTIFICATIVA' && (
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 ml-1">
                            R
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}

function Card({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border rounded-lg p-4 bg-white ${className}`}>
      <h2 className="font-medium text-sm text-gray-700 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={mono ? 'font-mono text-xs break-all' : ''}>{value}</span>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'gray',
}: {
  label: string;
  value: string;
  tone?: 'gray' | 'green' | 'amber';
}) {
  const toneClass =
    tone === 'green'
      ? 'text-green-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : 'text-gray-900';
  return (
    <div className="border rounded-lg p-4 bg-white">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
