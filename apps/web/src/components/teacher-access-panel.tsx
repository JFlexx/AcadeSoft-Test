'use client';

import { FormEvent, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';
import { useAuth } from '@/lib/auth-context';

type Access = { email: string; lastLoginAt: string | null } | null;

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'Error de red');

/** Admin panel on the teacher profile: give or remove their login. */
export function TeacherAccessPanel({
  teacherId,
  defaultEmail,
}: {
  teacherId: string;
  defaultEmail: string | null;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [access, setAccess] = useState<Access>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ access: Access }>(`/teachers/${teacherId}/access`)
      .then((r) => setAccess(r.access))
      .catch((err) => toast.error(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [teacherId]);

  async function grant(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const r = await api<{ access: Access }>(`/teachers/${teacherId}/access`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setAccess(r.access);
      setOpen(false);
      setPassword('');
      toast.success('Acceso creado. Comparte el email y la contraseña con el profesor.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke() {
    const ok = await confirmToast('¿Quitar el acceso de este profesor?', {
      description: 'Ya no podrá entrar. Su ficha y sus clases se mantienen.',
      confirmLabel: 'Quitar acceso',
    });
    if (!ok) return;
    try {
      await api(`/teachers/${teacherId}/access`, { method: 'DELETE' });
      setAccess(null);
      toast.success('Acceso retirado');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-white mb-8">
      <h2 className="font-medium text-sm text-gray-700 mb-2 flex items-center gap-2">
        <KeyRound className="h-4 w-4" /> Acceso del profesor
      </h2>
      <p className="text-sm text-gray-500 mb-3">
        Con acceso, el profesor entra desde el móvil, ve sus clases y pasa lista. No ve
        facturas ni datos de otras clases.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : access ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>
            Entra como <strong>{access.email}</strong>
            <span className="block text-xs text-gray-500">
              {access.lastLoginAt
                ? `Último acceso: ${new Date(access.lastLoginAt).toLocaleString('es-ES')}`
                : 'Todavía no ha entrado'}
            </span>
          </span>
          {isAdmin && (
            <button onClick={revoke} className="text-sm text-red-600 hover:underline shrink-0">
              Quitar acceso
            </button>
          )}
        </div>
      ) : !isAdmin ? (
        <p className="text-sm text-gray-500">Sin acceso. Solo la administración puede dárselo.</p>
      ) : !open ? (
        <button onClick={() => setOpen(true)} className="btn-secondary">
          Dar acceso al profesor
        </button>
      ) : (
        <form onSubmit={grant} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-600 block mb-1">Email *</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-600 block mb-1">
                Contraseña inicial * (mín. 8)
              </span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
          <p className="text-xs text-gray-500">
            El profesor podrá cambiarla en «Mi cuenta» o recuperarla con «¿Olvidaste tu
            contraseña?».
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Creando…' : 'Crear acceso'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
