'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

const MIN = 8;

// useSearchParams needs a Suspense boundary in the App Router.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN) return setError(`Mínimo ${MIN} caracteres`);
    if (password !== confirm) return setError('Las contraseñas no coinciden');

    setSubmitting(true);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
        skipAuth: true,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 border rounded-lg p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Nueva contraseña</h1>

        {!token ? (
          <p className="text-sm text-gray-700">
            El enlace no es válido. Pide uno nuevo desde{' '}
            <Link href="/forgot-password" className="text-brand-700 hover:underline">
              recuperar contraseña
            </Link>
            .
          </p>
        ) : done ? (
          <>
            <p className="text-sm text-gray-700">
              Contraseña cambiada. Ya puedes iniciar sesión con la nueva.
            </p>
            <Link href="/login" className="btn-primary w-full">
              Iniciar sesión
            </Link>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Nueva contraseña (mín. {MIN})</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Repítela</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </label>
            {error && (
              <p className="text-sm text-red-600">
                {error}{' '}
                {/caducado|válido/.test(error) && (
                  <Link href="/forgot-password" className="underline">
                    Pedir otro enlace
                  </Link>
                )}
              </p>
            )}
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
