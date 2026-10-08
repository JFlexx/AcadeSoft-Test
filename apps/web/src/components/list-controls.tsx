'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

/** Lower-case, accent-free, so "lucia" finds "Lucía". */
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** True when every word of the query appears in one of the fields. */
export function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = norm(fields.filter(Boolean).join(' '));
  return words.every((w) => haystack.includes(w));
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block w-full sm:w-80">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border bg-white py-1.5 pl-8 pr-2 text-sm"
      />
    </label>
  );
}

/**
 * Client-side pages over an already-filtered list. Academies have hundreds of
 * rows, not millions, so the API sends them all and the browser slices.
 * Goes back to the first page whenever `resetKey` (the filters) changes.
 */
export function usePaged<T>(items: T[], resetKey: string, pageSize = 25) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [resetKey]);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pages - 1);
  return {
    items: items.slice(current * pageSize, (current + 1) * pageSize),
    page: current,
    pages,
    total: items.length,
    from: items.length === 0 ? 0 : current * pageSize + 1,
    to: Math.min(items.length, (current + 1) * pageSize),
    setPage,
  };
}

export function Pager({ paged }: { paged: ReturnType<typeof usePaged> }) {
  if (paged.pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
      <span>
        {paged.from}–{paged.to} de {paged.total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => paged.setPage(paged.page - 1)}
          disabled={paged.page === 0}
          className="btn-secondary px-2"
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-2">
          {paged.page + 1} / {paged.pages}
        </span>
        <button
          type="button"
          onClick={() => paged.setPage(paged.page + 1)}
          disabled={paged.page >= paged.pages - 1}
          className="btn-secondary px-2"
          aria-label="Página siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
