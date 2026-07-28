'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export default function PortalLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'guardian') router.replace('/');
  }, [isLoading, user, router]);

  if (isLoading || !user || user.role !== 'guardian') {
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
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white font-bold text-sm">
              A
            </span>
            <div className="min-w-0">
              <p className="font-semibold leading-tight">Portal de familias</p>
              <p className="text-xs text-gray-500 truncate">{user.tenant.name}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? 'Saliendo…' : 'Salir'}
          </button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
