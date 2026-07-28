'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type Group = {
  id: string;
  name: string;
  course: string;
  monthlyFee: string | null;
  spotsAvailable: number | null;
};

function formatEur(value: string | number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value));
}

const EMPTY = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  groupId: '',
  guardianName: '',
  guardianEmail: '',
  notes: '',
};

export default function EnrollPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [academy, setAcademy] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/public/academy/${slug}/groups`);
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setAcademy(data.academy);
        setGroups(data.groups);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, string> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        groupId: form.groupId,
      };
      if (form.email.trim()) payload.email = form.email.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.guardianName.trim()) payload.guardianName = form.guardianName.trim();
      if (form.guardianEmail.trim()) payload.guardianEmail = form.guardianEmail.trim();
      if (form.notes.trim()) payload.notes = form.notes.trim();

      const res = await fetch(`${API}/public/academy/${slug}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (Array.isArray(body?.message) ? body.message[0] : body?.message) ??
            'No se pudo enviar la solicitud',
        );
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Shell>
        <p className="text-sm text-gray-500">Cargando…</p>
      </Shell>
    );
  }

  if (notFound) {
    return (
      <Shell>
        <p className="text-sm text-gray-600">
          No hemos encontrado esta academia. Revisa el enlace.
        </p>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="text-center py-6">
          <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
          <h1 className="text-xl font-semibold">¡Solicitud enviada!</h1>
          <p className="text-sm text-gray-600 mt-2">
            {academy} revisará tu inscripción y se pondrá en contacto contigo.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="mb-5">
        <p className="text-xs uppercase tracking-wide text-brand-600 font-medium">
          Inscripción
        </p>
        <h1 className="text-xl font-semibold">{academy}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Rellena tus datos y elige un grupo. La academia confirmará tu plaza.
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="text-sm text-gray-500">
          Ahora mismo no hay grupos abiertos para inscripción.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset>
            <legend className="text-sm font-medium mb-2">Grupo</legend>
            <div className="space-y-2">
              {groups.map((g) => {
                const full = g.spotsAvailable === 0;
                return (
                  <label
                    key={g.id}
                    className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer ${
                      full ? 'opacity-50 cursor-not-allowed' : 'hover:border-brand-300'
                    } ${form.groupId === g.id ? 'border-brand-500 bg-brand-50' : ''}`}
                  >
                    <input
                      type="radio"
                      name="group"
                      value={g.id}
                      disabled={full}
                      checked={form.groupId === g.id}
                      onChange={() => setForm({ ...form, groupId: g.id })}
                      required
                    />
                    <span className="flex-1">
                      <span className="font-medium text-sm">{g.name}</span>
                      <span className="block text-xs text-gray-500">
                        {g.course}
                        {g.monthlyFee ? ` · ${formatEur(g.monthlyFee)}/mes` : ''}
                        {g.spotsAvailable != null &&
                          ` · ${full ? 'completo' : `${g.spotsAvailable} plazas`}`}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre del alumno" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} required />
            <Input label="Apellidos" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} required />
            <Input label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Input label="Teléfono" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          </div>

          <fieldset className="border-t pt-3 space-y-3">
            <legend className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Familia (opcional)
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Nombre del tutor" value={form.guardianName} onChange={(v) => setForm({ ...form, guardianName: v })} />
              <Input label="Email del tutor" type="email" value={form.guardianEmail} onChange={(v) => setForm({ ...form, guardianEmail: v })} />
            </div>
          </fieldset>

          <label className="block">
            <span className="text-xs text-gray-600 block mb-1">Comentarios</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white border rounded-xl shadow-sm p-6 my-8">
        {children}
      </div>
    </main>
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
