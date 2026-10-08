'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The open tab, kept in `?tab=` so a reload or a shared link lands on it.
 * Reads window.location directly: useSearchParams would force a Suspense
 * boundary on every page that uses tabs.
 */
export function useTab<T extends string>(keys: readonly T[], fallback: T): [T, (t: T) => void] {
  const [tab, setTabState] = useState<T>(fallback);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tab') as T | null;
    if (fromUrl && keys.includes(fromUrl)) setTabState(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTab = useCallback(
    (t: T) => {
      setTabState(t);
      const url = new URL(window.location.href);
      if (t === fallback) url.searchParams.delete('tab');
      else url.searchParams.set('tab', t);
      window.history.replaceState(window.history.state, '', url);
    },
    [fallback],
  );

  return [tab, setTab];
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (t: T) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);

  // On a phone the bar scrolls sideways: keep the open tab in view.
  useEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (bar.current && el) {
      bar.current.scrollLeft = el.offsetLeft - (bar.current.clientWidth - el.offsetWidth) / 2;
    }
  }, [value]);

  return (
    <div ref={bar} role="tablist" className="relative flex gap-1 border-b mb-6 overflow-x-auto">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`-mb-px shrink-0 whitespace-nowrap px-3 py-2 text-sm border-b-2 transition-colors ${
              active
                ? 'border-brand-600 text-brand-700 font-medium'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
            {t.count != null && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${
                  active ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
