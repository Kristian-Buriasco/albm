'use client';

import { useCallback, useEffect, useState } from 'react';

type TokenRow = {
  id: string;
  name: string;
  scope: 'read' | 'write';
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};

export default function ApiTokensPanel() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'write'>('read');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/api-tokens');
    if (res.ok) setTokens((await res.json()).tokens ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createToken() {
    if (!name.trim()) return;
    if (
      scope === 'write' &&
      !confirm('A write token can create and change galleries, publish, upload photos and invite collaborators. Create it?')
    ) {
      return;
    }
    setBusy(true);
    setNewToken(null);
    const res = await fetch('/api/admin/api-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), scope }),
    });
    setBusy(false);
    if (res.ok) {
      setNewToken((await res.json()).token);
      setName('');
      load();
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this token? Anything using it will stop working.')) return;
    const res = await fetch('/api/admin/api-tokens', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      alert(res.status === 401 ? 'Your session expired. Log in again.' : 'Could not revoke this token.');
      return;
    }
    load();
  }

  const active = tokens.filter((t) => !t.revokedAt);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-medium tracking-widest uppercase">API tokens</h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          For scripts and AI assistants (the Albm MCP server). <strong>Read</strong> tokens can only look at galleries,
          photos, comments and inquiries. <strong>Write</strong> tokens can also create and change them and upload
          photos, but never delete. Neither can touch settings, security, storage, tokens or updates.
        </p>
      </div>

      {newToken && (
        <div className="rounded border border-amber-500/50 bg-amber-50 p-4 text-xs dark:bg-amber-950/30">
          <p className="font-medium text-amber-900 dark:text-amber-200">Copy this token now — it will not be shown again:</p>
          <code className="mt-2 block font-mono text-sm break-all">{newToken}</code>
          <button type="button" className="mt-2 underline" onClick={() => navigator.clipboard.writeText(newToken)}>
            Copy to clipboard
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs">
          <span className="mb-1 block text-neutral-500">Token name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Claude on my laptop"
            maxLength={120}
            className="min-w-[12rem] border-b border-neutral-300 bg-transparent py-1 dark:border-neutral-700"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-neutral-500">Access</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'read' | 'write')}
            className="border-b border-neutral-300 bg-transparent py-1 dark:border-neutral-700"
          >
            <option value="read">Read only</option>
            <option value="write">Read and write</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={createToken}
          className="border border-neutral-900 px-4 py-1.5 text-xs uppercase dark:border-neutral-100"
        >
          Generate token
        </button>
      </div>

      {active.length > 0 && (
        <ul className="divide-y divide-neutral-200 text-xs dark:divide-neutral-800">
          {active.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-4 py-2">
              <div>
                <p className="font-medium">
                  {t.name} <span className="font-normal text-neutral-500">· {t.scope === 'write' ? 'read and write' : 'read only'}</span>
                </p>
                <p className="text-neutral-500">
                  Created {new Date(t.createdAt).toLocaleDateString()}
                  {t.lastUsedAt ? ` · Last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : ' · Never used'}
                </p>
              </div>
              <button type="button" onClick={() => revoke(t.id)} className="underline">
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
