'use client';

import { useEffect, useState } from 'react';
import { formatBytes } from '@/lib/format-bytes';

type Usage = {
  usedBytes: number;
  quotaBytes: number | null;
  pct: number | null;
  state: 'ok' | 'warn' | 'over';
};

const stateColor: Record<'ok' | 'warn' | 'over', string> = {
  ok: 'bg-neutral-900 dark:bg-neutral-100',
  warn: 'bg-amber-500',
  over: 'bg-red-600',
};

const stateTextColor: Record<'ok' | 'warn' | 'over', string> = {
  ok: 'text-neutral-500 dark:text-neutral-400',
  warn: 'text-amber-600 dark:text-amber-400',
  over: 'text-red-600 dark:text-red-400',
};

/**
 * Drop-in storage usage bar for a single gallery. Soft/advisory only — never
 * blocks uploads. Client component: fetches usage from the admin API so it can
 * live inside the (client) gallery Settings tab.
 */
export default function StorageBar({ galleryId }: { galleryId: string }) {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/galleries/${galleryId}/storage`)
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (alive) setUsage(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [galleryId]);

  if (!usage) {
    return (
      <div className="h-1.5 w-full animate-pulse bg-neutral-100 dark:bg-neutral-900" />
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className={stateTextColor[usage.state]}>
          {formatBytes(usage.usedBytes)}
          {usage.quotaBytes != null && ` / ${formatBytes(usage.quotaBytes)}`}
          {usage.quotaBytes == null && ' · no quota set'}
        </span>
        {usage.pct != null && (
          <span className={stateTextColor[usage.state]}>{usage.pct.toFixed(0)}%</span>
        )}
      </div>
      {usage.pct != null && (
        <div className="h-1.5 w-full bg-neutral-100 dark:bg-neutral-900">
          <div
            className={`h-full ${stateColor[usage.state]}`}
            style={{ width: `${Math.min(100, Math.max(usage.pct, 0))}%` }}
          />
        </div>
      )}
    </div>
  );
}
