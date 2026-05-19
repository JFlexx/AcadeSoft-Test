'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  GraduationCap,
  BookOpen,
  Users2,
  CircleUser,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/students', label: 'Alumnos', icon: Users },
  { href: '/teachers', label: 'Profesores', icon: GraduationCap },
  { href: '/courses', label: 'Cursos', icon: BookOpen },
  { href: '/groups', label: 'Grupos', icon: Users2 },
  { href: '/me', label: 'Mi cuenta', icon: CircleUser },
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
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-60 border-r bg-white flex flex-col">
        <div className="px-4 py-5 border-b">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white font-bold text-sm">
              A
            </span>
            <div className="min-w-0">
              <p className="font-semibold leading-tight">AcadeSoft</p>
              <p className="text-xs text-gray-500 truncate">{user.tenant.name}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? 'bg-brand-50 text-brand-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${active ? 'text-brand-600' : 'text-gray-400'}`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t">
          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50 transition-colors"
          >
            <LogOut className="h-4 w-4 text-gray-400" />
            {signingOut ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
