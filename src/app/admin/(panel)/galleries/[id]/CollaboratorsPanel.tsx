'use client';

import { useCallback, useEffect, useState } from 'react';
import ShareTools from '@/components/ShareTools';

type CollaboratorRow = {
  grantId: string;
  collaboratorId: string;
  email: string;
  name: string | null;
  capabilities: string;
  lastLoginAt: number | null;
  disabledAt: number | null;
  createdAt: number;
};

function formatDate(ts: number | null): string {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleString();
}

function capsLabel(raw: string): string {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.join(', ') : raw;
  } catch {
    return raw;
  }
}

export default function CollaboratorsPanel({ galleryId }: { galleryId: string }) {
  const [rows, setRows] = useState<CollaboratorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/galleries/${galleryId}/collaborators`);
    if (res.ok) {
      const data = await res.json();
      setRows(data.collaborators ?? []);
    }
    setLoading(false);
  }, [galleryId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setInviting(true);
    setError(null);
    setOnboardingUrl(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, name: name.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Failed to invite collaborator.');
        return;
      }
      const data = await res.json();
      setOnboardingUrl(data.onboardingUrl);
      setEmail('');
      setName('');
      await load();
    } finally {
      setInviting(false);
    }
  }

  async function revoke(grantId: string) {
    if (!confirm('Revoke this collaborator\'s access to this gallery?')) return;
    await fetch(`/api/admin/collaborators/grants/${grantId}`, { method: 'DELETE' });
    await load();
  }

  async function saveName(collaboratorId: string, value: string) {
    await fetch(`/api/admin/collaborators/${collaboratorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: value }),
    });
    await load();
  }

  async function toggleDisabled(collaboratorId: string, disabled: boolean) {
    await fetch(`/api/admin/collaborators/${collaboratorId}/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled }),
    });
    await load();
  }

  return (
    <section className="space-y-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <h2 className="text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
        Collaborators
      </h2>
      <p className="text-[11px] text-neutral-400">
        Invite someone to upload and organize photos in this gallery only. They sign in
        with a passkey — no password login.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={320}
            placeholder="collaborator@example.com"
            className="border-b border-neutral-300 bg-transparent py-1 dark:border-neutral-700"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Name (shown in photo credits)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className="border-b border-neutral-300 bg-transparent py-1 dark:border-neutral-700"
          />
        </label>
        <button
          type="button"
          disabled={inviting || !email.trim()}
          onClick={invite}
          className="border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-40 dark:border-neutral-700"
        >
          {inviting ? 'Inviting…' : 'Invite'}
        </button>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {onboardingUrl && (
        <div className="space-y-2 rounded border border-accent/30 bg-accent/5 p-3 text-xs dark:border-accent-dark/30 dark:bg-accent-dark/5">
          <p className="font-medium">Send this link to the collaborator (expires in 7 days):</p>
          <code className="block max-w-full truncate rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-900">
            {onboardingUrl}
          </code>
          <ShareTools url={onboardingUrl} />
        </div>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">No collaborators yet.</p>
      )}

      {rows.length > 0 && (
        <ul className="space-y-2 text-xs">
          {rows.map((r) => (
            <li
              key={r.grantId}
              className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-2 dark:border-neutral-900"
            >
              <span className="font-medium">{r.email}</span>
              <label className="flex items-center gap-1">
                <span className="sr-only">Display name for photo credits</span>
                <input
                  type="text"
                  defaultValue={r.name ?? ''}
                  maxLength={200}
                  placeholder="Display name (credits)"
                  aria-label={`Display name for ${r.email}`}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== (r.name ?? '')) void saveName(r.collaboratorId, e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="w-44 border-b border-neutral-300 bg-transparent py-0.5 dark:border-neutral-700"
                />
              </label>
              {!r.name?.trim() && (
                <span className="text-amber-600 dark:text-amber-400">no name — not credited</span>
              )}
              <span className="text-neutral-400">{capsLabel(r.capabilities)}</span>
              <span className="text-neutral-400">Last login: {formatDate(r.lastLoginAt)}</span>
              {r.disabledAt && <span className="text-red-500">Disabled</span>}
              <button
                type="button"
                className="text-red-500 hover:underline"
                onClick={() => revoke(r.grantId)}
              >
                Revoke
              </button>
              <button
                type="button"
                className="underline"
                onClick={() => toggleDisabled(r.collaboratorId, !r.disabledAt)}
              >
                {r.disabledAt ? 'Enable' : 'Disable'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
