'use client';

import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';

type Teacher = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  bio: string | null;
  isActive: boolean;
};

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  bio: '',
};

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await api<Teacher[]>('/teachers');
      setTeachers(data);
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

  function startEdit(t: Teacher) {
    setEditing(t);
    setForm({
      firstName: t.firstName,
      lastName: t.lastName,
      email: t.email ?? '',
      phone: t.phone ?? '',
      bio: t.bio ?? '',
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
      if (form.bio.trim()) payload.bio = form.bio.trim();

      if (editing) {
        await api(`/teachers/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/teachers', { method: 'POST', body: JSON.stringify(payload) });
      }
      cancel();
      toast.success(editing ? 'Profesor actualizado' : 'Profesor creado');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(t: Teacher) {
    const ok = await confirmToast(`¿Borrar a ${t.firstName} ${t.lastName}?`, {
      description: 'Sus grupos quedarán sin profesor asignado.',
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await api(`/teachers/${t.id}`, { method: 'DELETE' });
      toast.success('Profesor eliminado');
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error de red');
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Profesores</h1>
        {!showForm && (
          <button
            onClick={startCreate}
            className="btn-primary"
          >
            + Nuevo profesor
          </button>
        )}
      </header>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border rounded p-4 mb-6 space-y-3 bg-gray-50"
        >
          <h2 className="font-medium">
            {editing
              ? `Editar — ${editing.firstName} ${editing.lastName}`
              : 'Nuevo profesor'}
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
            <label className="block col-span-2">
              <span className="text-xs text-gray-600 block mb-1">Bio</span>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                rows={3}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
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
      ) : teachers.length === 0 ? (
        <p className="text-sm text-gray-500">
          No hay profesores. Crea el primero con el botón de arriba.
        </p>
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
            {teachers.map((t) => (
              <tr key={t.id} className="border-b hover:bg-gray-50">
                <td className="py-2">
                  {t.firstName} {t.lastName}
                </td>
                <td className="py-2 text-gray-600">{t.email ?? '—'}</td>
                <td className="py-2 text-gray-600">{t.phone ?? '—'}</td>
                <td className="py-2">
                  {t.isActive ? (
                    <span className="text-green-700 text-xs">Activo</span>
                  ) : (
                    <span className="text-gray-500 text-xs">Inactivo</span>
                  )}
                </td>
                <td className="py-2 text-right space-x-3">
                  <button onClick={() => startEdit(t)} className="text-sm hover:underline">
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(t)}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
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
        className="w-full border rounded px-2 py-1 text-sm"
      />
    </label>
  );
}
