'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, LayoutGrid, Search, User, Users2 } from 'lucide-react';
import { api } from '@/lib/api';

type Item = { kind: 'page' | 'student' | 'teacher' | 'group'; label: string; hint?: string; href: string };
type Person = { id: string; firstName: string; lastName: string; email: string | null };
type Group = { id: string; name: string };

const ICON = { page: LayoutGrid, student: User, teacher: GraduationCap, group: Users2 };
const KIND_LABEL = { page: 'Ir a', student: 'Alumno', teacher: 'Profesor', group: 'Grupo' };

/** Lower-case, accent-free, so "lucia" finds "Lucía". */
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Global search (Ctrl/⌘+K): jump to a page, student, teacher or group.
 * People and groups are loaded once when it first opens — an academy has
 * hundreds of them, not millions, so filtering in the browser is instant.
 */
export function CommandPalette({
  open,
  onClose,
  pages,
}: {
  open: boolean;
  onClose: () => void;
  pages: { href: string; label: string }[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [data, setData] = useState<Item[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    setTimeout(() => input.current?.focus(), 0);
    if (data) return;
    Promise.all([
      api<Person[]>('/students'),
      api<Person[]>('/teachers'),
      api<Group[]>('/groups'),
    ])
      .then(([students, teachers, groups]) =>
        setData([
          ...students.map((s) => ({
            kind: 'student' as const,
            label: `${s.firstName} ${s.lastName}`,
            hint: s.email ?? undefined,
            href: `/students/${s.id}`,
          })),
          ...teachers.map((t) => ({
            kind: 'teacher' as const,
            label: `${t.firstName} ${t.lastName}`,
            hint: t.email ?? undefined,
            href: `/teachers/${t.id}`,
          })),
          ...groups.map((g) => ({ kind: 'group' as const, label: g.name, href: `/groups/${g.id}` })),
        ]),
      )
      .catch(() => setData([]));
  }, [open, data]);

  const results = useMemo(() => {
    const term = norm(q.trim());
    const all: Item[] = [...pages.map((p) => ({ kind: 'page' as const, ...p })), ...(data ?? [])];
    if (!term) return all.filter((i) => i.kind === 'page').slice(0, 8);
    return all
      .filter((i) => norm(`${i.label} ${i.hint ?? ''}`).includes(term))
      .sort((a, b) => Number(!norm(a.label).startsWith(term)) - Number(!norm(b.label).startsWith(term)))
      .slice(0, 12);
  }, [q, data, pages]);

  function go(item: Item) {
    onClose();
    router.push(item.href);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Buscar"
        className="w-full max-w-lg rounded-xl bg-white shadow-xl border overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 border-b">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === 'Enter' && results[active]) go(results[active]);
            }}
            placeholder="Busca un alumno, profesor, grupo o sección…"
            className="flex-1 py-3 text-sm outline-none"
          />
          <kbd className="hidden sm:inline text-[10px] text-gray-400 border rounded px-1">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-sm text-gray-500 text-center">
              {data === null && q ? 'Buscando…' : 'Sin resultados'}
            </li>
          ) : (
            results.map((r, i) => {
              const Icon = ICON[r.kind];
              return (
                <li key={r.href}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm ${
                      i === active ? 'bg-brand-50' : ''
                    }`}
                  >
                    <Icon className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{r.label}</span>
                      {r.hint && <span className="block text-xs text-gray-500 truncate">{r.hint}</span>}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">{KIND_LABEL[r.kind]}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
