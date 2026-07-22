'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Inquiry } from '@/db/schema';

type Filter = 'new' | 'read' | 'archived' | null;

const TABS: { value: Exclude<Filter, null> | 'all'; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'read', label: 'Read' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function AdminInquiriesClient({
  rows,
  filter,
  emailEnabled,
}: {
  rows: Inquiry[];
  filter: Filter;
  emailEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(id: string, status: Inquiry['status']) {
    setBusy(id);
    try {
      await fetch(`/api/admin/inquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const active = filter ?? 'all';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Inquiries</h1>
        {!emailEnabled && (
          <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
            Email notifications off (set SMTP env to enable)
          </span>
        )}
      </div>

      <div className="mb-6 flex gap-1 text-sm">
        {TABS.map((t) => {
          const href = t.value === 'all' ? '/admin/inquiries' : `/admin/inquiries?status=${t.value}`;
          const on = active === t.value;
          return (
            <a
              key={t.value}
              href={href}
              className={`rounded-full px-3 py-1 transition-colors ${
                on
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
              }`}
            >
              {t.label}
            </a>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No inquiries here.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`rounded-lg border p-5 ${
                r.status === 'new'
                  ? 'border-neutral-300 dark:border-neutral-700'
                  : 'border-neutral-200 dark:border-neutral-800'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  {r.status === 'new' && (
                    <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">
                      new
                    </span>
                  )}
                </div>
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  {fmtDate(r.createdAt)}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                <a
                  href={`mailto:${r.email}?subject=${encodeURIComponent('Re: your inquiry')}`}
                  className="hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  {r.email}
                </a>
                {r.eventType && <span>· {r.eventType}</span>}
                {r.eventDate && <span>· {fmtDate(r.eventDate)}</span>}
              </div>

              <p className="mt-3 text-sm whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
                {r.message}
              </p>

              <div className="mt-4 flex gap-4 text-xs">
                <a
                  href={`mailto:${r.email}?subject=${encodeURIComponent('Re: your inquiry')}`}
                  className="text-accent hover:underline dark:text-accent-dark"
                >
                  Reply
                </a>
                {r.status !== 'read' && (
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => setStatus(r.id, 'read')}
                    className="text-neutral-500 hover:text-neutral-900 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-100"
                  >
                    Mark read
                  </button>
                )}
                {r.status !== 'archived' ? (
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => setStatus(r.id, 'archived')}
                    className="text-neutral-500 hover:text-neutral-900 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-100"
                  >
                    Archive
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => setStatus(r.id, 'read')}
                    className="text-neutral-500 hover:text-neutral-900 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-100"
                  >
                    Restore
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
