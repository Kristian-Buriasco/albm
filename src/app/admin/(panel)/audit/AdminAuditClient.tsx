'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

type Row = {
  id: string;
  at: number;
  action: string;
  actorType: string | null;
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
  const [actor, setActorState] = useState<string | null>(searchParams.get('actor'));
  const [days, setDaysState] = useState<string | null>(searchParams.get('days'));

  const visible = useMemo(() => {
    if (!filter) return rows;
    return rows.filter((r) => r.action === filter);
  }, [rows, filter]);

  function updateParams(newAction: string | null, newActor: string | null, newDays: string | null) {
    const p = new URLSearchParams();
    if (newAction) p.set('action', newAction);
    if (newActor) p.set('actor', newActor);
    if (newDays) p.set('days', newDays);
    router.replace(`/admin/audit?${p.toString()}`);
  }

  function setFilter(action: string | null) {
    updateParams(action || null, actor, days);
  }

  function setActor(value: string | null) {
    setActorState(value);
    updateParams(filter, value || null, days);
  }

  function setDays(value: string | null) {
    setDaysState(value);
    updateParams(filter, actor, value || null);
  }

  const csvUrl = (() => {
    const p = new URLSearchParams();
    if (filter) p.set('action', filter);
    if (actor) p.set('actor', actor);
    if (days) p.set('days', days);
    p.set('format', 'csv');
    return `/api/admin/audit?${p.toString()}`;
  })();

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
        <select
          value={actor ?? ''}
          onChange={(e) => setActor(e.target.value || null)}
          className="border-b border-neutral-300 bg-transparent py-1 text-xs outline-none dark:border-neutral-700"
        >
          <option value="">All actors</option>
          <option value="owner">Owner</option>
          <option value="collaborator">Collaborator</option>
        </select>
        <select
          value={days ?? ''}
          onChange={(e) => setDays(e.target.value || null)}
          className="border-b border-neutral-300 bg-transparent py-1 text-xs outline-none dark:border-neutral-700"
        >
          <option value="">All time</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
        </select>
        <a href={csvUrl} className="text-xs underline">
          Export CSV
        </a>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-neutral-500">No audit entries yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
          {visible.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-neutral-500">{r.action}</span>
                  {r.actorType && (
                    <span className="text-xs text-neutral-400">{r.actorType}</span>
                  )}
                </div>
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
