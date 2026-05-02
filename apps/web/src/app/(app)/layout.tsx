'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

const NAV = [
  { href: '/students', label: 'Alumnos' },
  { href: '/teachers', label: 'Profesores' },
  { href: '/courses', label: 'Cursos' },
  { href: '/groups', label: 'Grupos' },
  { href: '/me', label: 'Mi cuenta' },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  if (isLoading || !user) {
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
    <div className="min-h-screen flex">
      <aside className="w-56 border-r bg-gray-50 flex flex-col">
        <div className="p-4 border-b">
          <p className="font-semibold">AcadeSoft</p>
          <p className="text-xs text-gray-500 truncate">{user.tenant.name}</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded text-sm ${
                  active ? 'bg-black text-white' : 'hover:bg-gray-200'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t">
          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="w-full px-3 py-2 text-sm text-left hover:bg-gray-200 rounded disabled:opacity-50"
          >
            {signingOut ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
