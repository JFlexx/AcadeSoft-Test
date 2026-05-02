'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading, login } = useAuth();
  const [tenantSlug, setTenantSlug] = useState('acme');
  const [email, setEmail] = useState('admin@acme.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) router.replace('/me');
  }, [isLoading, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ tenantSlug, email, password });
      router.replace('/me');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Credenciales inválidas');
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Error de red');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 border rounded-lg p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Acceder</h1>

        <div className="space-y-1">
          <label htmlFor="tenantSlug" className="text-sm font-medium">
            Academia
          </label>
          <input
            id="tenantSlug"
            type="text"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            required
            autoComplete="organization"
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50"
        >
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
