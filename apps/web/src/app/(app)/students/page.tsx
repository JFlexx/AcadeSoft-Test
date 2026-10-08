'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Users, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';
import { EmptyState } from '@/components/empty-state';
import { StudentImportPanel } from '@/components/students-import';
import { downloadCsv } from '@/lib/csv';
import { formatEur } from '@/lib/format';
import { matches, Pager, SearchBox, usePaged } from '@/components/list-controls';

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  iban: string | null;
  mandateReference: string | null;
  mandateDate: string | null;
  discountPercent: string | null;
  isActive: boolean;
  groups: { id: string; name: string; status: 'ACTIVE' | 'PENDING' | 'WAITLIST' }[];
  /** What they still owe, e.g. "55.00". */
  balance: string;
};

type Show = 'all' | 'active' | 'inactive' | 'owing';
const SHOW_LABEL: Record<Show, string> = {
  all: 'Todos',
  active: 'Activos',
  inactive: 'Inactivos',
  owing: 'Con pagos pendientes',
};

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  iban: '',
  mandateReference: '',
  mandateDate: '',
  discountPercent: '',
};

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState('');
  const [show, setShow] = useState<Show>('all');

  const allGroups = useMemo(() => {
    const byId = new Map<string, string>();
    for (const st of students) for (const g of st.groups) byId.set(g.id, g.name);
    return [...byId]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const filtered = useMemo(
    () =>
      students.filter((st) => {
        if (show === 'active' && !st.isActive) return false;
        if (show === 'inactive' && st.isActive) return false;
        if (show === 'owing' && Number(st.balance) <= 0) return false;
        if (groupId && !st.groups.some((g) => g.id === groupId)) return false;
        return matches(query, st.firstName, st.lastName, st.email, st.phone);
      }),
    [students, query, groupId, show],
  );
  const paged = usePaged(filtered, `${query}|${groupId}|${show}`);

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
      discountPercent: s.discountPercent != null ? String(s.discountPercent) : '',
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
      'Descuento %',
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
      s.discountPercent != null ? String(s.discountPercent) : '',
      s.isActive ? 'Activo' : 'Inactivo',
    ]);
    downloadCsv(`alumnos-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, string | number | null> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
      };
      if (form.email.trim()) payload.email = form.email.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.iban.trim()) payload.iban = form.iban.replace(/\s+/g, '').toUpperCase();
      if (form.mandateReference.trim()) payload.mandateReference = form.mandateReference.trim();
      if (form.mandateDate) payload.mandateDate = new Date(form.mandateDate).toISOString();
      if (form.discountPercent.trim()) payload.discountPercent = Number(form.discountPercent);
      else if (editing) payload.discountPercent = null; // allow clearing

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
    <div className="p-6 max-w-5xl">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Alumnos</h1>
        <div className="flex items-center gap-2">
          {!showImport && (
            <button
              onClick={() => {
                setShowImport(true);
                setShowForm(false);
              }}
              className="btn-secondary"
              title="Importar alumnos desde un archivo CSV"
            >
              <Upload className="h-4 w-4" />
              Importar CSV
            </button>
          )}
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

      {showImport && (
        <StudentImportPanel onClose={() => setShowImport(false)} onImported={refresh} />
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded p-4 mb-6 space-y-3 bg-gray-50">
          <h2 className="font-medium">
            {editing ? `Editar — ${editing.firstName} ${editing.lastName}` : 'Nuevo alumno'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <label className="block">
              <span className="text-xs text-gray-600 block mb-1">Descuento (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.discountPercent}
                onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                placeholder="0"
                className="w-full border rounded px-2 py-1 text-sm"
              />
              <span className="text-xs text-gray-400 mt-1 block">
                Descuento familia/hermanos sobre la cuota mensual.
              </span>
            </label>
          </div>

          <fieldset className="border-t pt-3 space-y-3">
            <legend className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Domiciliación SEPA
            </legend>
            <p className="text-xs text-gray-500 -mt-2">
              Necesario para incluir al alumno en las remesas de domiciliación.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear'}
            </button>
            <button type="button" onClick={cancel} className="btn-secondary">
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
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Buscar por nombre, email o teléfono"
            />
            {allGroups.length > 0 && (
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="border rounded-md px-2 py-1.5 text-sm bg-white"
                aria-label="Grupo"
              >
                <option value="">Todos los grupos</option>
                {allGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={show}
              onChange={(e) => setShow(e.target.value as Show)}
              className="border rounded-md px-2 py-1.5 text-sm bg-white"
              aria-label="Mostrar"
            >
              {(Object.keys(SHOW_LABEL) as Show[]).map((k) => (
                <option key={k} value={k}>
                  {SHOW_LABEL[k]}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-500 sm:ml-auto">
              {filtered.length === students.length
                ? `${students.length} alumnos`
                : `${filtered.length} de ${students.length} alumnos`}
            </span>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              Ningún alumno coincide con la búsqueda.
            </p>
          ) : (
            <>
              {/* Phone: one card per student */}
              <ul className="md:hidden divide-y border rounded-lg bg-white">
                {paged.items.map((st) => (
                  <li key={st.id} className="flex items-start gap-3 px-3 py-3">
                    <Link href={`/students/${st.id}`} className="flex-1 min-w-0">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-medium truncate">
                          {st.firstName} {st.lastName}
                        </span>
                        <Balance value={st.balance} hideZero />
                      </span>
                      <GroupChips groups={st.groups} />
                      <span className="block text-xs text-gray-500 truncate mt-1">
                        {[st.email, st.phone].filter(Boolean).join(' · ') || 'Sin contacto'}
                        {!st.isActive && ' · Inactivo'}
                      </span>
                    </Link>
                    <button
                      onClick={() => startEdit(st)}
                      className="text-sm text-gray-600 hover:underline"
                    >
                      Editar
                    </button>
                  </li>
                ))}
              </ul>

              {/* Desktop: table */}
              <div className="hidden md:block">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left border-b text-gray-500">
                      <th className="py-2 font-medium">Alumno</th>
                      <th className="py-2 font-medium">Teléfono</th>
                      <th className="py-2 font-medium">Grupos</th>
                      <th className="py-2 font-medium text-right">Pendiente</th>
                      <th className="py-2 font-medium pl-4">Estado</th>
                      <th className="py-2 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.items.map((st) => (
                      <tr key={st.id} className="border-b hover:bg-gray-50 align-top">
                        <td className="py-2">
                          <Link href={`/students/${st.id}`} className="font-medium hover:underline">
                            {st.firstName} {st.lastName}
                          </Link>
                          {st.email && (
                            <span className="block text-xs text-gray-500">{st.email}</span>
                          )}
                        </td>
                        <td className="py-2 text-gray-600">{st.phone ?? '—'}</td>
                        <td className="py-2">
                          {st.groups.length === 0 ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <GroupChips groups={st.groups} />
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <Balance value={st.balance} />
                        </td>
                        <td className="py-2 pl-4">
                          {st.isActive ? (
                            <span className="text-green-700 text-xs">Activo</span>
                          ) : (
                            <span className="text-gray-500 text-xs">Inactivo</span>
                          )}
                        </td>
                        <td className="py-2 text-right space-x-3 whitespace-nowrap">
                          <button onClick={() => startEdit(st)} className="text-sm hover:underline">
                            Editar
                          </button>
                          <button
                            onClick={() => handleDelete(st)}
                            className="text-sm text-red-600 hover:underline"
                          >
                            Borrar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager paged={paged} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function Balance({ value, hideZero = false }: { value: string; hideZero?: boolean }) {
  const n = Number(value);
  if (n <= 0) return hideZero ? null : <span className="text-gray-400">—</span>;
  return <span className="font-medium text-amber-700 whitespace-nowrap">{formatEur(n)}</span>;
}

const CHIP_SUFFIX = { ACTIVE: '', PENDING: ' · pendiente', WAITLIST: ' · en espera' };

function GroupChips({ groups }: { groups: Student['groups'] }) {
  if (groups.length === 0) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1">
      {groups.map((g) => (
        <span
          key={g.id}
          className={`text-xs px-1.5 py-0.5 rounded ${
            g.status === 'ACTIVE' ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {g.name}
          {CHIP_SUFFIX[g.status]}
        </span>
      ))}
    </span>
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
