'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  Users2,
  CalendarDays,
  Mail,
  Receipt,
  CalendarClock,
  Settings,
  Sparkles,
  BarChart3,
  CircleUser,
  LogOut,
  Menu,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { homeFor, isAdminAppRole } from '@/lib/home';
import { CommandPalette } from '@/components/command-palette';

type NavItem = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean };

/** The menu, grouped by what the academy is doing. */
const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Día a día',
    items: [
      { href: '/', label: 'Inicio', icon: LayoutDashboard },
      { href: '/calendar', label: 'Calendario', icon: CalendarDays },
      { href: '/messages', label: 'Mensajes', icon: Mail },
    ],
  },
  {
    title: 'Académico',
    items: [
      { href: '/students', label: 'Alumnos', icon: Users },
      { href: '/teachers', label: 'Profesores', icon: GraduationCap },
      { href: '/courses', label: 'Cursos', icon: BookOpen },
      { href: '/groups', label: 'Grupos', icon: Users2 },
      { href: '/trials', label: 'Clases de prueba', icon: Sparkles },
    ],
  },
  {
    title: 'Cobros',
    items: [
      { href: '/invoices', label: 'Facturas', icon: Receipt },
      { href: '/billing', label: 'Mensualidades', icon: CalendarClock },
      { href: '/reports', label: 'Informes', icon: BarChart3 },
    ],
  },
  {
    title: 'Configuración',
    items: [
      { href: '/settings', label: 'Ajustes', icon: Settings, adminOnly: true },
      { href: '/me', label: 'Mi cuenta', icon: CircleUser },
    ],
  },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/login');
    else if (!isAdminAppRole(user.role)) router.replace(homeFor(user.role));
  }, [isLoading, user, router]);

  // Close the mobile menu when navigating.
  useEffect(() => setDrawerOpen(false), [pathname]);

  // Ctrl/⌘+K opens the search anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sections = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        items: s.items.filter((i) => !i.adminOnly || user?.role === 'admin'),
      })),
    [user?.role],
  );
  const pages = useMemo(
    () => sections.flatMap((s) => s.items.map(({ href, label }) => ({ href, label }))),
    [sections],
  );

  if (isLoading || !user || !isAdminAppRole(user.role)) {
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

  const sidebar = (
    <>
      <div className="px-4 py-4 border-b">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white font-bold text-sm">
            A
          </span>
          <div className="min-w-0">
            <p className="font-semibold leading-tight">AcadeSoft</p>
            <p className="text-xs text-gray-500 truncate">{user.tenant.name}</p>
          </div>
        </div>
        <button
          onClick={() => setSearchOpen(true)}
          className="mt-3 w-full flex items-center gap-2 rounded-md border bg-gray-50 px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Buscar…</span>
          <kbd className="hidden lg:inline text-[10px] border rounded px-1 bg-white">Ctrl K</kbd>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {sections.map((section) => (
          <div key={section.title} className="mb-3">
            <p className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                      active ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-brand-600' : 'text-gray-400'}`} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
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
    </>
  );

  return (
    <div className="min-h-screen lg:flex bg-gray-50">
      {/* Desktop: fixed sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 border-r bg-white flex-col sticky top-0 h-screen">
        {sidebar}
      </aside>

      {/* Mobile / tablet: top bar + drawer */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-2 border-b bg-white px-3 py-2">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 -ml-1 rounded-md text-gray-700 hover:bg-gray-100"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="flex-1 min-w-0 truncate font-semibold">{user.tenant.name}</span>
        <button
          onClick={() => setSearchOpen(true)}
          className="p-2 rounded-md text-gray-700 hover:bg-gray-100"
          aria-label="Buscar"
        >
          <Search className="h-5 w-5" />
        </button>
      </header>
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-white flex flex-col h-full shadow-xl">
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute right-2 top-3 p-2 rounded-md text-gray-500 hover:bg-gray-100"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="app-main flex-1 min-w-0">{children}</main>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} pages={pages} />
    </div>
  );
}
