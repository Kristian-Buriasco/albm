'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useRef } from 'react';

export interface TabDef {
  id: string;
  label: string;
  badge?: number;
}

export default function Tabs({
  tabs,
  paramKey = 'tab',
  children,
}: {
  tabs: TabDef[];
  paramKey?: string;
  children: (activeId: string) => React.ReactNode;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const requested = params.get(paramKey);
  const active = tabs.find((t) => t.id === requested)?.id ?? tabs[0]?.id ?? '';

  const select = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params.toString());
      next.set(paramKey, id);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, paramKey, pathname, router],
  );

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const nextIdx = (idx + dir + tabs.length) % tabs.length;
    btnRefs.current[nextIdx]?.focus();
    select(tabs[nextIdx].id);
  };

  return (
    <div>
      <div
        role="tablist"
        aria-orientation="horizontal"
        className="flex gap-6 border-b border-neutral-200 dark:border-neutral-800"
      >
        {tabs.map((t, i) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                btnRefs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => select(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`-mb-px flex items-center gap-2 border-b-2 pb-3 text-xs tracking-widest uppercase transition-colors ${
                isActive
                  ? 'border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
              }`}
            >
              {t.label}
              {t.badge ? (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] leading-none text-white">
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        className="pt-8"
      >
        {children(active)}
      </div>
    </div>
  );
}
