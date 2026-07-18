'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type SessionRow = {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  userAgentHash: string | null;
  ipHash: string | null;
  device: string | null;
  location: string | null;
  isCurrent: boolean;
};

export default function AdminSessionsPanel() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/sessions');
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(id: string) {
    if (!confirm('Revoke this session? That device will be signed out on its next request.')) {
      return;
    }
    setBusy(true);
    await fetch('/api/admin/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setBusy(false);
    load();
    router.refresh();
  }

  async function revokeOthers() {
    if (!confirm('Revoke all other sessions? Other devices will be signed out.')) return;
    setBusy(true);
    await fetch('/api/admin/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revokeAllOthers: true }),
    });
    setBusy(false);
    load();
    router.refresh();
  }

  function fmt(ts: number) {
    return new Date(ts).toLocaleString();
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium tracking-widest uppercase">Active sessions</h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Server-tracked admin sign-ins. Revoke a session to sign that device out immediately.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || sessions.filter((s) => !s.isCurrent).length === 0}
          onClick={revokeOthers}
          className="border border-neutral-300 px-3 py-1 text-xs uppercase dark:border-neutral-700"
        >
          Revoke all others
        </button>
      </div>

      {sessions.length === 0 ? (
        <p className="text-xs text-neutral-500">No active sessions.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 text-xs dark:divide-neutral-800">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">
                  {s.isCurrent ? 'This device' : 'Other device'}
                  {s.isCurrent && (
                    <span className="ml-2 text-neutral-500">(current)</span>
                  )}
                </p>
                <p className="mt-0.5 text-neutral-500">
                  Created {fmt(s.createdAt)} · Last seen {fmt(s.lastSeenAt)}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {s.device ?? 'Unknown device'} · {s.location ?? 'Unknown location'}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-neutral-400">
                  UA {s.userAgentHash ?? '—'} · IP {s.ipHash ?? '—'}
                </p>
              </div>
              {!s.isCurrent && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => revoke(s.id)}
                  className="underline"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
