'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type Group = { id: string; name: string; course: string; spotsAvailable: number | null };
type TrialSession = { id: string; scheduledAt: string; durationMinutes: number | null };

const EMPTY = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  guardianName: '',
  guardianEmail: '',
  guardianPhone: '',
  notes: '',
};

function when(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${date.charAt(0).toUpperCase()}${date.slice(1)} · ${time}`;
}

/** Public page: book a free trial class in one of a group's next classes. */
export function TrialBookingForm({
  slug,
  academy,
  groups,
}: {
  slug: string;
  academy: string | null;
  groups: Group[];
}) {
  const open = groups.filter((g) => g.spotsAvailable !== 0);
  const [groupId, setGroupId] = useState('');
  const [sessions, setSessions] = useState<TrialSession[] | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ scheduledAt: string; groupName: string } | null>(null);

  useEffect(() => {
    setSessions(null);
    setSessionId('');
    if (!groupId) return;
    fetch(`${API}/public/academy/${slug}/groups/${groupId}/trial-sessions`)
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((d: { sessions: TrialSession[] }) => setSessions(d.sessions))
      .catch(() => setSessions([]));
  }, [slug, groupId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, string | boolean> = {
        acceptPrivacy,
        sessionId,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
      };
      for (const k of ['email', 'phone', 'guardianName', 'guardianEmail', 'guardianPhone', 'notes'] as const) {
        if (form[k].trim()) payload[k] = form[k].trim();
      }
      const res = await fetch(`${API}/public/academy/${slug}/trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (Array.isArray(body?.message) ? body.message[0] : body?.message) ??
            'No se pudo reservar la clase',
        );
      }
      setBooked({ scheduledAt: body.scheduledAt, groupName: body.groupName });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setSubmitting(false);
    }
  }

  if (booked) {
    return (
      <div className="text-center py-6">
        <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
        <h1 className="text-xl font-semibold">¡Clase de prueba reservada!</h1>
        <p className="text-sm text-gray-700 mt-2">
          {booked.groupName} · {when(booked.scheduledAt)}
        </p>
        <p className="text-sm text-gray-500 mt-2">
          Si nos has dejado un email, te hemos enviado la confirmación. {academy} os espera.
        </p>
      </div>
    );
  }

  if (open.length === 0) {
    return <p className="text-sm text-gray-500">Ahora mismo no hay grupos con plazas para probar.</p>;
  }

  const set = (k: keyof typeof EMPTY) => (v: string) => setForm({ ...form, [k]: v });

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium block mb-2">1. Elige el grupo</span>
        <select
          required
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">Selecciona…</option>
          {open.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} · {g.course}
            </option>
          ))}
        </select>
      </label>

      {groupId && (
        <fieldset>
          <legend className="text-sm font-medium mb-2">2. Elige el día</legend>
          {sessions === null ? (
            <p className="text-sm text-gray-500">Buscando clases…</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-500">
              No hay clases disponibles para probar en las próximas semanas. Puedes pedir la
              inscripción directamente.
            </p>
          ) : (
            <div className="grid gap-2">
              {sessions.map((s) => (
                <label
                  key={s.id}
                  className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer hover:border-brand-300 ${
                    sessionId === s.id ? 'border-brand-500 bg-brand-50' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="session"
                    required
                    checked={sessionId === s.id}
                    onChange={() => setSessionId(s.id)}
                  />
                  <span className="text-sm">{when(s.scheduledAt)}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}

      {sessionId && (
        <>
          <p className="text-sm font-medium">3. Tus datos</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre del alumno" value={form.firstName} onChange={set('firstName')} required />
            <Input label="Apellidos" value={form.lastName} onChange={set('lastName')} required />
            <Input label="Email" type="email" value={form.email} onChange={set('email')} />
            <Input label="Teléfono" value={form.phone} onChange={set('phone')} />
          </div>
          <fieldset className="border-t pt-3 space-y-3">
            <legend className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Familia (si el alumno es menor)
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Nombre del tutor" value={form.guardianName} onChange={set('guardianName')} />
              <Input label="Email del tutor" type="email" value={form.guardianEmail} onChange={set('guardianEmail')} />
              <Input label="Teléfono del tutor" value={form.guardianPhone} onChange={set('guardianPhone')} />
            </div>
          </fieldset>
          <label className="block">
            <span className="text-xs text-gray-600 block mb-1">
              ¿Algo que debamos saber? (nivel, edad…)
            </span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          </label>

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              required
              checked={acceptPrivacy}
              onChange={(e) => setAcceptPrivacy(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              He leído la{' '}
              <a href={`/enroll/${slug}/privacidad`} target="_blank" className="text-brand-700 underline">
                política de privacidad
              </a>{' '}
              de {academy}.
            </span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Reservando…' : 'Reservar clase de prueba'}
          </button>
        </>
      )}
    </form>
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
