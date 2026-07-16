'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

type Row = {
  id: string;
  at: number;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string;
};

export default function AdminAuditClient({
  rows,
  actions,
  filter,
}: {
  rows: Row[];
  actions: string[];
  filter: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const visible = useMemo(() => {
    if (!filter) return rows;
    return rows.filter((r) => r.action === filter);
  }, [rows, filter]);

  function setFilter(action: string | null) {
    const p = new URLSearchParams(searchParams.toString());
    if (action) p.set('action', action);
    else p.delete('action');
    router.replace(`/admin/audit?${p.toString()}`);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-medium tracking-widest uppercase">Audit log</h1>
        <select
          value={filter ?? ''}
          onChange={(e) => setFilter(e.target.value || null)}
          className="border-b border-neutral-300 bg-transparent py-1 text-xs outline-none dark:border-neutral-700"
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-neutral-500">No audit entries yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
          {visible.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-xs text-neutral-500">{r.action}</span>
                <time className="text-xs text-neutral-400 tabular-nums">
                  {new Date(r.at).toLocaleString('en-GB')}
                </time>
              </div>
              <p className="mt-1">{r.summary}</p>
              {r.targetType && (
                <p className="mt-0.5 text-xs text-neutral-500">
                  {r.targetType}
                  {r.targetId ? ` · ${r.targetId}` : ''}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-xs text-neutral-400">
        Read-only trail of privileged actions. Retained up to 5,000 rows or 1 year.
      </p>
    </div>
  );
}
