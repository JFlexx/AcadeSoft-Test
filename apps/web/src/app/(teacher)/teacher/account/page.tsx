'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ChangePasswordForm } from '@/components/change-password-form';

export default function TeacherAccountPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="space-y-6">
      <Link href="/teacher" className="text-sm text-gray-500 hover:underline">
        ← Mis clases
      </Link>
      <header>
        <h1 className="text-xl font-semibold">Mi cuenta</h1>
        <p className="text-sm text-gray-500 mt-1">
          {user.firstName} {user.lastName} · {user.email}
        </p>
      </header>
      <section className="border rounded-xl bg-white p-5">
        <h2 className="font-medium mb-3">Cambiar contraseña</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
