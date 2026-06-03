'use client';

import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';

type Course = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
};

const DEFAULT_COLOR = '#6366f1';

const EMPTY_FORM = {
  name: '',
  description: '',
  color: DEFAULT_COLOR,
};

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await api<Course[]>('/courses');
      setCourses(data);
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

  function startEdit(c: Course) {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description ?? '',
      color: c.color ?? DEFAULT_COLOR,
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
        name: form.name.trim(),
        color: form.color,
      };
      if (form.description.trim()) payload.description = form.description.trim();

      if (editing) {
        await api(`/courses/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/courses', { method: 'POST', body: JSON.stringify(payload) });
      }
      cancel();
      toast.success(editing ? 'Curso actualizado' : 'Curso creado');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(c: Course) {
    const ok = await confirmToast(`¿Borrar el curso "${c.name}"?`, {
      description: 'Si tiene grupos asociados, debes borrarlos primero.',
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await api(`/courses/${c.id}`, { method: 'DELETE' });
      toast.success('Curso eliminado');
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error de red');
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Cursos</h1>
        {!showForm && (
          <button
            onClick={startCreate}
            className="btn-primary"
          >
            + Nuevo curso
          </button>
        )}
      </header>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border rounded p-4 mb-6 space-y-3 bg-gray-50"
        >
          <h2 className="font-medium">
            {editing ? `Editar — ${editing.name}` : 'Nuevo curso'}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block col-span-2">
              <span className="text-xs text-gray-600 block mb-1">Nombre *</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="block col-span-2">
              <span className="text-xs text-gray-600 block mb-1">Descripción</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="block col-span-2">
              <span className="text-xs text-gray-600 block mb-1">Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-8 w-12 border rounded cursor-pointer"
                />
                <code className="text-xs text-gray-600">{form.color}</code>
              </div>
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
      ) : courses.length === 0 ? (
        <p className="text-sm text-gray-500">
          No hay cursos. Crea el primero con el botón de arriba.
        </p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b text-gray-500">
              <th className="py-2 font-medium w-8"></th>
              <th className="py-2 font-medium">Nombre</th>
              <th className="py-2 font-medium">Descripción</th>
              <th className="py-2 font-medium">Estado</th>
              <th className="py-2 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="border-b hover:bg-gray-50">
                <td className="py-2">
                  <span
                    className="inline-block w-4 h-4 rounded"
                    style={{ backgroundColor: c.color ?? DEFAULT_COLOR }}
                  />
                </td>
                <td className="py-2">{c.name}</td>
                <td className="py-2 text-gray-600 max-w-xs truncate">
                  {c.description ?? '—'}
                </td>
                <td className="py-2">
                  {c.isActive ? (
                    <span className="text-green-700 text-xs">Activo</span>
                  ) : (
                    <span className="text-gray-500 text-xs">Inactivo</span>
                  )}
                </td>
                <td className="py-2 text-right space-x-3">
                  <button onClick={() => startEdit(c)} className="text-sm hover:underline">
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(c)}
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
