'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';

type InvoiceStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'PARTIAL'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';

type PortalInvoice = {
  id: string;
  number: string;
  amount: string;
  paidAmount: string;
  status: InvoiceStatus;
  issueDate: string;
  type: 'ORIGINAL' | 'RECTIFICATIVA';
};

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

type PortalStudent = {
  id: string;
  firstName: string;
  lastName: string;
  enrollments: { group: { name: string; course: { name: string } } }[];
  invoices: PortalInvoice[];
  attendances: { status: AttendanceStatus; session: { scheduledAt: string } }[];
};

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Borrador',
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagada',
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

const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Presente',
  ABSENT: 'Ausente',
  LATE: 'Tarde',
  EXCUSED: 'Justificado',
};

const ATTENDANCE_STYLE: Record<AttendanceStatus, string> = {
  PRESENT: 'text-green-700',
  ABSENT: 'text-red-700',
  LATE: 'text-amber-700',
  EXCUSED: 'text-blue-700',
};

function formatEur(value: string | number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES');
}

export default function PortalPage() {
  const { user } = useAuth();
  const [students, setStudents] = useState<PortalStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<PortalStudent[]>('/portal/students')
      .then(setStudents)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Hola, {user?.firstName} 👋</h1>
        <p className="text-sm text-gray-500 mt-1">
          Aquí puedes consultar la información de tu familia.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : students.length === 0 ? (
        <div className="border border-dashed rounded-xl p-8 text-center bg-white">
          <p className="text-sm text-gray-500">
            Todavía no hay información vinculada a tu cuenta. Contacta con la
            academia.
          </p>
        </div>
      ) : (
        students.map((s) => <StudentCard key={s.id} student={s} />)
      )}
    </div>
  );
}

function StudentCard({ student }: { student: PortalStudent }) {
  const [payingId, setPayingId] = useState<string | null>(null);

  async function pay(invoiceId: string) {
    setPayingId(invoiceId);
    try {
      const { url } = await api<{ url: string }>(
        `/portal/invoices/${invoiceId}/checkout`,
        { method: 'POST' },
      );
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al iniciar el pago');
      setPayingId(null);
    }
  }

  const pending = student.invoices
    .filter((i) => i.status !== 'CANCELLED')
    .reduce((sum, i) => sum + (Number(i.amount) - Number(i.paidAmount)), 0);

  return (
    <section className="border rounded-xl bg-white overflow-hidden">
      <header className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold">
            {student.firstName} {student.lastName}
          </h2>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {student.enrollments.length === 0 ? (
              <span className="text-xs text-gray-400">Sin grupos</span>
            ) : (
              student.enrollments.map((e, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 rounded bg-brand-50 text-brand-700"
                >
                  {e.group.name}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Pendiente de pago</p>
          <p
            className={`text-lg font-semibold ${pending > 0 ? 'text-amber-700' : 'text-green-700'}`}
          >
            {formatEur(pending)}
          </p>
        </div>
      </header>

      <div className="p-5 grid sm:grid-cols-2 gap-6">
        <div>
          <h3 className="font-medium text-sm text-gray-700 mb-2">Facturas</h3>
          {student.invoices.length === 0 ? (
            <p className="text-sm text-gray-400">Sin facturas.</p>
          ) : (
            <ul className="space-y-1.5">
              {student.invoices.slice(0, 8).map((i) => (
                <li key={i.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    <span className="font-mono text-xs">{i.number}</span> ·{' '}
                    {formatDate(i.issueDate)}
                  </span>
                  <span className="flex items-center gap-2">
                    {formatEur(i.amount)}
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${INVOICE_STATUS_STYLE[i.status]}`}
                    >
                      {INVOICE_STATUS_LABEL[i.status]}
                    </span>
                    {['PENDING', 'PARTIAL', 'OVERDUE'].includes(i.status) && (
                      <button
                        onClick={() => pay(i.id)}
                        disabled={payingId === i.id}
                        className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50"
                      >
                        {payingId === i.id ? '…' : 'Pagar'}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="font-medium text-sm text-gray-700 mb-2">
            Asistencia reciente
          </h3>
          {student.attendances.length === 0 ? (
            <p className="text-sm text-gray-400">Sin registros.</p>
          ) : (
            <ul className="space-y-1.5">
              {student.attendances.slice(0, 8).map((a, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {formatDate(a.session.scheduledAt)}
                  </span>
                  <span className={`text-xs font-medium ${ATTENDANCE_STYLE[a.status]}`}>
                    {ATTENDANCE_LABEL[a.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
