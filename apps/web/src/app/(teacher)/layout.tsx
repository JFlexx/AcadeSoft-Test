'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CircleUser, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { homeFor } from '@/lib/home';

/** Mobile-first shell of the teacher app: their classes and attendance only. */
export default function TeacherLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'teacher') router.replace(homeFor(user.role));
  }, [isLoading, user, router]);

  if (isLoading || !user || user.role !== 'teacher') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-500">Cargando…</p>
      </main>
    );
  }

  async function handleLogout() {
    setSigningOut(true);
    await logout();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/teacher" className="flex items-center gap-2 min-w-0">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white font-bold text-sm">
              A
            </span>
            <span className="min-w-0">
              <span className="block font-semibold leading-tight truncate">
                {user.firstName} {user.lastName}
              </span>
              <span className="block text-xs text-gray-500 truncate">{user.tenant.name}</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/teacher/account"
              className="p-2 text-gray-600 hover:text-gray-900"
              aria-label="Mi cuenta"
            >
              <CircleUser className="h-5 w-5" />
            </Link>
            <button
              onClick={handleLogout}
              disabled={signingOut}
              className="p-2 text-gray-600 hover:text-gray-900 disabled:opacity-50"
              aria-label="Salir"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
        <nav className="max-w-2xl mx-auto px-4 flex gap-1 text-sm">
          {[
            { href: '/teacher', label: 'Clases', active: !pathname.startsWith('/teacher/grades') && !pathname.startsWith('/teacher/account') },
            { href: '/teacher/grades', label: 'Notas', active: pathname.startsWith('/teacher/grades') },
          ].map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`px-3 py-2 border-b-2 ${t.active ? 'border-brand-600 text-brand-700 font-medium' : 'border-transparent text-gray-600'}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5">{children}</main>
    </div>
  );
}
