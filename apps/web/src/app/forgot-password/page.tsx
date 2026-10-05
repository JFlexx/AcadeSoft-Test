'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [tenantSlug, setTenantSlug] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ tenantSlug: tenantSlug.trim(), email: email.trim() }),
        skipAuth: true,
      });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Demasiados intentos. Prueba de nuevo más tarde.'
          : err instanceof ApiError
            ? err.message
            : 'Error de red',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 border rounded-lg p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Recuperar contraseña</h1>

        {sent ? (
          <>
            <p className="text-sm text-gray-700">
              Si existe una cuenta con esos datos, te hemos enviado un email con
              un enlace para elegir una nueva contraseña. Caduca en 60 minutos.
            </p>
            <p className="text-xs text-gray-500">
              ¿No llega? Revisa la carpeta de spam.
            </p>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-gray-600">
              Indica tu academia y tu email y te enviaremos un enlace.
            </p>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Academia</span>
              <input
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                required
                autoComplete="organization"
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </form>
        )}

        <p className="text-sm text-center">
          <Link href="/login" className="text-brand-700 hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
