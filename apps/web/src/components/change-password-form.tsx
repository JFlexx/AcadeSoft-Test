'use client';

import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError, setAccessToken } from '@/lib/api';

const MIN = 8;

/** Change the signed-in user's password (admins and families). */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < MIN) return setError(`La nueva contraseña debe tener al menos ${MIN} caracteres`);
    if (next !== confirm) return setError('Las contraseñas nuevas no coinciden');
    if (next === current) return setError('La nueva contraseña debe ser distinta de la actual');

    setSaving(true);
    try {
      const res = await api<{ accessToken: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      setAccessToken(res.accessToken); // the session was rotated server-side
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Contraseña cambiada');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setSaving(false);
    }
  }

  const field = 'w-full border rounded px-3 py-2 text-sm';
  return (
    <form onSubmit={submit} className="space-y-3 max-w-sm">
      <label className="block">
        <span className="text-xs text-gray-600 block mb-1">Contraseña actual</span>
        <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={field} />
      </label>
      <label className="block">
        <span className="text-xs text-gray-600 block mb-1">Nueva contraseña (mín. {MIN} caracteres)</span>
        <input type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} className={field} />
      </label>
      <label className="block">
        <span className="text-xs text-gray-600 block mb-1">Repite la nueva contraseña</span>
        <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? 'Guardando…' : 'Cambiar contraseña'}
      </button>
    </form>
  );
}
