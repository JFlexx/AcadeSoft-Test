'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export default function SignupPage() {
  const router = useRouter();
  const { user, isLoading, signup } = useAuth();

  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) router.replace('/settings');
  }, [isLoading, user, router]);

  function handleNameChange(value: string) {
    setTenantName(value);
    if (!slugEdited) setTenantSlug(slugify(value));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup({
        tenantName: tenantName.trim(),
        tenantSlug: tenantSlug.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
      });
      router.replace('/');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError('Esa URL de academia ya está cogida. Prueba otra.');
        } else {
          setError(err.message);
        }
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
        className="w-full max-w-md space-y-4 border rounded-lg p-6 shadow-sm bg-white"
      >
        <header>
          <h1 className="text-xl font-semibold">Crea tu academia</h1>
          <p className="text-sm text-gray-600 mt-1">
            Te creamos tu espacio en AcadeSoft. Podrás configurar el resto
            después de entrar.
          </p>
        </header>

        <div className="space-y-1">
          <label htmlFor="tenantName" className="text-sm font-medium">
            Nombre de la academia
          </label>
          <input
            id="tenantName"
            type="text"
            value={tenantName}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            maxLength={150}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Academia Acme"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="tenantSlug" className="text-sm font-medium">
            URL única
          </label>
          <input
            id="tenantSlug"
            type="text"
            value={tenantSlug}
            onChange={(e) => {
              setSlugEdited(true);
              setTenantSlug(e.target.value);
            }}
            required
            minLength={2}
            maxLength={50}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className="w-full border rounded px-3 py-2 text-sm font-mono"
            placeholder="academia-acme"
          />
          <p className="text-xs text-gray-500">
            Solo minúsculas, números y guiones. Es tu identificador para
            iniciar sesión.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="firstName" className="text-sm font-medium">
              Tu nombre
            </label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              maxLength={100}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="lastName" className="text-sm font-medium">
              Apellidos
            </label>
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              maxLength={100}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
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
            maxLength={200}
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
            autoComplete="new-password"
            minLength={8}
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-500">Mínimo 8 caracteres.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full"
        >
          {submitting ? 'Creando…' : 'Crear academia'}
        </button>

        <p className="text-sm text-gray-600 text-center">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-brand-700 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </form>
    </main>
  );
}
