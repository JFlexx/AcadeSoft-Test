'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'staff';
  lastLoginAt: string | null;
  isMe: boolean;
};

const EMPTY = { firstName: '', lastName: '', email: '', password: '' };
const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'Error de red');

/** Ajustes (admin only): back-office users, and adding the front office. */
export function TeamPanel() {
  const [team, setTeam] = useState<Member[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setTeam(await api<Member[]>('/team'));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/team', { method: 'POST', body: JSON.stringify(form) });
      toast.success('Usuario creado. Comparte el email y la contraseña con esa persona.');
      setForm(EMPTY);
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: Member) {
    const ok = await confirmToast(`¿Quitar el acceso de ${m.firstName} ${m.lastName}?`, {
      confirmLabel: 'Quitar',
    });
    if (!ok) return;
    try {
      await api(`/team/${m.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-medium">Equipo</h2>
        <p className="text-sm text-gray-600 mt-1">
          Los usuarios de <strong>secretaría</strong> llevan el día a día (alumnos, inscripciones,
          asistencia, cobros, mensajes…) pero no pueden cambiar estos ajustes, dar acceso a
          profesores ni gestionar el equipo.
        </p>
      </div>
      <ul className="divide-y border rounded bg-white">
        {team.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium">
                {m.firstName} {m.lastName}
                {m.isMe && <span className="text-gray-400 font-normal"> (tú)</span>}
              </span>
              <span className="block text-xs text-gray-500 truncate">
                {m.email} · {m.role === 'admin' ? 'Administración' : 'Secretaría'}
              </span>
            </span>
            {m.role === 'staff' && (
              <button
                onClick={() => remove(m)}
                className="p-1 text-gray-400 hover:text-red-600"
                aria-label={`Quitar a ${m.firstName}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-secondary">
          Añadir usuario de secretaría
        </button>
      ) : (
        <form onSubmit={add} className="grid sm:grid-cols-2 gap-2 border rounded p-3 bg-gray-50">
          {(
            [
              ['firstName', 'Nombre', 'text'],
              ['lastName', 'Apellidos', 'text'],
              ['email', 'Email', 'email'],
              ['password', 'Contraseña inicial (mín. 8)', 'password'],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="block">
              <span className="text-xs text-gray-600 block mb-1">{label} *</span>
              <input
                required
                type={type}
                minLength={key === 'password' ? 8 : undefined}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm bg-white"
              />
            </label>
          ))}
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Creando…' : 'Crear usuario'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
