'use client';

import { useEffect, useState } from 'react';

type VersionInfo = {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  canUpdate?: boolean;
};

export default function UpdateBadge() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/version')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) setInfo(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function update() {
    if (!info?.latest || !confirm(`Update from v${info.current} to v${info.latest}? Albm restarts and is unavailable for about a minute. The database is backed up first, and a failed update rolls back.`)) return;
    setBusy(true);
    setNote('Starting…');
    const res = await fetch('/api/admin/update', { method: 'POST' });
    if (!res.ok) {
      setNote((await res.json().catch(() => null))?.error ?? 'Update failed to start');
      setBusy(false);
      return;
    }
    // The app goes down while it restarts, so failed polls are expected; stop on done/failed.
    for (;;) {
      await new Promise((r) => setTimeout(r, 3000));
      const st = await fetch('/api/admin/update')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (!st) continue;
      setNote(st.message);
      if (st.state === 'done') return location.reload();
      if (st.state === 'failed' || st.state === 'unreachable') return setBusy(false);
    }
  }

  if (!info?.updateAvailable) return null;

  if (info.canUpdate) {
    return (
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={update}
          disabled={busy}
          title={`You're on v${info.current}. Update to v${info.latest}.`}
          className="rounded-full border border-amber-500 px-2 py-0.5 text-[10px] tracking-wide text-amber-600 transition-colors hover:bg-amber-500 hover:text-white disabled:opacity-50 dark:text-amber-400"
        >
          {busy ? 'Updating…' : `Update to v${info.latest}`}
        </button>
        {note && (
          <span role="status" className="text-[10px] text-neutral-500 dark:text-neutral-400">
            {note}
          </span>
        )}
      </span>
    );
  }

  return (
    <a
      href={`https://github.com/Kristian-Buriasco/Albm/releases/tag/v${info.latest}`}
      target="_blank"
      rel="noreferrer"
      title={`You're on v${info.current}. v${info.latest} is available.`}
      className="rounded-full border border-amber-500 px-2 py-0.5 text-[10px] tracking-wide text-amber-600 transition-colors hover:bg-amber-500 hover:text-white dark:text-amber-400"
    >
      v{info.latest} available
    </a>
  );
}
