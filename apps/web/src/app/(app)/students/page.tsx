'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Download } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';
import { EmptyState } from '@/components/empty-state';
import { downloadCsv } from '@/lib/csv';

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  iban: string | null;
  mandateReference: string | null;
  mandateDate: string | null;
  isActive: boolean;
};

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  iban: '',
  mandateReference: '',
  mandateDate: '',
};

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await api<Student[]>('/students');
      setStudents(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function startCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError(null);
  }

  function startEdit(s: Student) {
    setEditing(s);
    setForm({
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email ?? '',
      phone: s.phone ?? '',
      iban: s.iban ?? '',
      mandateReference: s.mandateReference ?? '',
      mandateDate: s.mandateDate ? s.mandateDate.slice(0, 10) : '',
    });
    setShowForm(true);
    setError(null);
  }

  function cancel() {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function handleExport() {
    const headers = [
      'Nombre',
      'Apellidos',
      'Email',
      'Teléfono',
      'IBAN',
      'Ref. mandato',
      'Fecha mandato',
      'Estado',
    ];
    const rows = students.map((s) => [
      s.firstName,
      s.lastName,
      s.email ?? '',
      s.phone ?? '',
      s.iban ?? '',
      s.mandateReference ?? '',
      s.mandateDate ? new Date(s.mandateDate).toLocaleDateString('es-ES') : '',
      s.isActive ? 'Activo' : 'Inactivo',
    ]);
    downloadCsv(
      `alumnos-${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows,
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, string> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
      };
      if (form.email.trim()) payload.email = form.email.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.iban.trim()) payload.iban = form.iban.replace(/\s+/g, '').toUpperCase();
      if (form.mandateReference.trim())
        payload.mandateReference = form.mandateReference.trim();
      if (form.mandateDate)
        payload.mandateDate = new Date(form.mandateDate).toISOString();

      if (editing) {
        await api(`/students/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/students', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      cancel();
      toast.success(editing ? 'Alumno actualizado' : 'Alumno creado');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(s: Student) {
    const ok = await confirmToast(`¿Borrar a ${s.firstName} ${s.lastName}?`, {
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await api(`/students/${s.id}`, { method: 'DELETE' });
      toast.success('Alumno eliminado');
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error de red');
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Alumnos</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={students.length === 0}
            className="btn-secondary"
            title="Exportar alumnos a CSV"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
          {!showForm && (
            <button onClick={startCreate} className="btn-primary">
              + Nuevo alumno
            </button>
          )}
        </div>
      </header>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border rounded p-4 mb-6 space-y-3 bg-gray-50"
        >
          <h2 className="font-medium">
            {editing
              ? `Editar — ${editing.firstName} ${editing.lastName}`
              : 'Nuevo alumno'}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nombre"
              value={form.firstName}
              onChange={(v) => setForm({ ...form, firstName: v })}
              required
            />
            <Input
              label="Apellidos"
              value={form.lastName}
              onChange={(v) => setForm({ ...form, lastName: v })}
              required
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
            />
            <Input
              label="Teléfono"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
            />
          </div>

          <fieldset className="border-t pt-3 space-y-3">
            <legend className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Domiciliación SEPA
            </legend>
            <p className="text-xs text-gray-500 -mt-2">
              Necesario para incluir al alumno en las remesas de domiciliación.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="IBAN"
                value={form.iban}
                onChange={(v) => setForm({ ...form, iban: v })}
                placeholder="ES…"
              />
              <Input
                label="Referencia de mandato"
                value={form.mandateReference}
                onChange={(v) => setForm({ ...form, mandateReference: v })}
                placeholder="MND-001"
              />
              <Input
                label="Fecha de firma del mandato"
                type="date"
                value={form.mandateDate}
                onChange={(v) => setForm({ ...form, mandateDate: v })}
              />
            </div>
          </fieldset>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear'}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay alumnos todavía"
          description="Da de alta a tu primer alumno para empezar a gestionar inscripciones y facturas."
          action={
            !showForm && (
              <button onClick={startCreate} className="btn-primary">
                + Nuevo alumno
              </button>
            )
          }
        />
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b text-gray-500">
              <th className="py-2 font-medium">Nombre</th>
              <th className="py-2 font-medium">Email</th>
              <th className="py-2 font-medium">Teléfono</th>
              <th className="py-2 font-medium">Estado</th>
              <th className="py-2 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-b hover:bg-gray-50">
                <td className="py-2">
                  <Link href={`/students/${s.id}`} className="hover:underline">
                    {s.firstName} {s.lastName}
                  </Link>
                </td>
                <td className="py-2 text-gray-600">{s.email ?? '—'}</td>
                <td className="py-2 text-gray-600">{s.phone ?? '—'}</td>
                <td className="py-2">
                  {s.isActive ? (
                    <span className="text-green-700 text-xs">Activo</span>
                  ) : (
                    <span className="text-gray-500 text-xs">Inactivo</span>
                  )}
                </td>
                <td className="py-2 text-right space-x-3">
                  <button
                    onClick={() => startEdit(s)}
                    className="text-sm hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-600 block mb-1">
        {label}
        {required && ' *'}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full border rounded px-2 py-1 text-sm"
      />
    </label>
  );
}
