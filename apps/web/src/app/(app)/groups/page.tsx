'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Users2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';
import { EmptyState } from '@/components/empty-state';

type Course = { id: string; name: string };
type Teacher = { id: string; firstName: string; lastName: string };
type Group = {
  id: string;
  courseId: string;
  teacherId: string | null;
  name: string;
  description: string | null;
  maxCapacity: number | null;
  monthlyFee: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
};

const EMPTY_FORM = {
  courseId: '',
  teacherId: '',
  name: '',
  description: '',
  maxCapacity: '',
  monthlyFee: '',
  startDate: '',
  endDate: '',
};

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCourse, setFilterCourse] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [g, c, t] = await Promise.all([
        api<Group[]>('/groups'),
        api<Course[]>('/courses'),
        api<Teacher[]>('/teachers'),
      ]);
      setGroups(g);
      setCourses(c);
      setTeachers(t);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const courseById = useMemo(
    () => Object.fromEntries(courses.map((c) => [c.id, c])),
    [courses],
  );
  const teacherById = useMemo(
    () => Object.fromEntries(teachers.map((t) => [t.id, t])),
    [teachers],
  );

  const filtered = filterCourse
    ? groups.filter((g) => g.courseId === filterCourse)
    : groups;

  function startCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, courseId: courses[0]?.id ?? '' });
    setShowForm(true);
    setError(null);
  }

  function startEdit(g: Group) {
    setEditing(g);
    setForm({
      courseId: g.courseId,
      teacherId: g.teacherId ?? '',
      name: g.name,
      description: g.description ?? '',
      maxCapacity: g.maxCapacity?.toString() ?? '',
      monthlyFee: g.monthlyFee ?? '',
      startDate: g.startDate ? g.startDate.slice(0, 10) : '',
      endDate: g.endDate ? g.endDate.slice(0, 10) : '',
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
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
      };
      if (!editing) payload.courseId = form.courseId;
      else if (form.courseId !== editing.courseId) payload.courseId = form.courseId;

      if (form.teacherId) payload.teacherId = form.teacherId;
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.maxCapacity) payload.maxCapacity = Number(form.maxCapacity);
      if (form.monthlyFee) payload.monthlyFee = Number(form.monthlyFee);
      if (form.startDate) payload.startDate = new Date(form.startDate).toISOString();
      if (form.endDate) payload.endDate = new Date(form.endDate).toISOString();

      if (editing) {
        await api(`/groups/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/groups', { method: 'POST', body: JSON.stringify(payload) });
      }
      cancel();
      toast.success(editing ? 'Grupo actualizado' : 'Grupo creado');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(g: Group) {
    const ok = await confirmToast(`¿Borrar el grupo "${g.name}"?`, {
      description: 'Se borrarán también sus inscripciones y sesiones.',
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await api(`/groups/${g.id}`, { method: 'DELETE' });
      toast.success('Grupo eliminado');
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error de red');
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Grupos</h1>
        {!showForm && (
          <button
            onClick={startCreate}
            disabled={courses.length === 0}
            className="btn-primary"
            title={courses.length === 0 ? 'Crea primero un curso' : ''}
          >
            + Nuevo grupo
          </button>
        )}
      </header>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border rounded p-4 mb-6 space-y-3 bg-gray-50"
        >
          <h2 className="font-medium">
            {editing ? `Editar — ${editing.name}` : 'Nuevo grupo'}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Curso" required>
              <select
                value={form.courseId}
                onChange={(e) => setForm({ ...form, courseId: e.target.value })}
                required
                className="w-full border rounded px-2 py-1 text-sm bg-white"
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Profesor (opcional)">
              <select
                value={form.teacherId}
                onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm bg-white"
              >
                <option value="">Sin asignar</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.firstName} {t.lastName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nombre" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </Field>
            <Field label="Aforo máximo">
              <input
                type="number"
                min={1}
                value={form.maxCapacity}
                onChange={(e) => setForm({ ...form, maxCapacity: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </Field>
            <Field label="Cuota mensual (€)">
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.monthlyFee}
                onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })}
                placeholder="0.00"
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </Field>
            <Field label="Inicio">
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </Field>
            <Field label="Fin">
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </Field>
            <Field label="Descripción" full>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </Field>
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

      {courses.length > 0 && groups.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <label className="text-xs text-gray-600">Filtrar por curso:</label>
          <select
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-white"
          >
            <option value="">Todos</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {groups.length === 0 ? (
        courses.length === 0 ? (
          <EmptyState
            icon={Users2}
            title="No hay grupos todavía"
            description="Los grupos van dentro de un curso. Crea primero un curso para poder añadir grupos."
            action={
              <Link href="/courses" className="btn-primary">
                Crear un curso
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={Users2}
            title="No hay grupos todavía"
            description="Crea tu primer grupo dentro de un curso para inscribir alumnos y planificar sesiones."
            action={
              !showForm && (
                <button onClick={startCreate} className="btn-primary">
                  + Nuevo grupo
                </button>
              )
            }
          />
        )
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500">Ningún grupo en ese curso.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b text-gray-500">
              <th className="py-2 font-medium">Nombre</th>
              <th className="py-2 font-medium">Curso</th>
              <th className="py-2 font-medium">Profesor</th>
              <th className="py-2 font-medium">Aforo</th>
              <th className="py-2 font-medium text-right">Cuota/mes</th>
              <th className="py-2 font-medium">Estado</th>
              <th className="py-2 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g.id} className="border-b hover:bg-gray-50">
                <td className="py-2">
                  <Link href={`/groups/${g.id}`} className="hover:underline">
                    {g.name}
                  </Link>
                </td>
                <td className="py-2 text-gray-600">
                  {courseById[g.courseId]?.name ?? '—'}
                </td>
                <td className="py-2 text-gray-600">
                  {g.teacherId
                    ? `${teacherById[g.teacherId]?.firstName ?? ''} ${teacherById[g.teacherId]?.lastName ?? ''}`.trim()
                    : '—'}
                </td>
                <td className="py-2 text-gray-600">{g.maxCapacity ?? '—'}</td>
                <td className="py-2 text-right text-gray-600">
                  {g.monthlyFee
                    ? new Intl.NumberFormat('es-ES', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(Number(g.monthlyFee))
                    : '—'}
                </td>
                <td className="py-2">
                  {g.isActive ? (
                    <span className="text-green-700 text-xs">Activo</span>
                  ) : (
                    <span className="text-gray-500 text-xs">Inactivo</span>
                  )}
                </td>
                <td className="py-2 text-right space-x-3">
                  <button onClick={() => startEdit(g)} className="text-sm hover:underline">
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(g)}
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

function Field({
  label,
  required,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${full ? 'col-span-2' : ''}`}>
      <span className="text-xs text-gray-600 block mb-1">
        {label}
        {required && ' *'}
      </span>
      {children}
    </label>
  );
}
