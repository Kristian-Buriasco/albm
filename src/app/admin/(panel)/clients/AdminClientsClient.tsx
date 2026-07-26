'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Client } from '@/db/schema';

export default function AdminClientsClient({
  clients,
  tagsByClient,
}: {
  clients: Client[];
  tagsByClient: Record<string, { id: string; name: string }[]>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const names = new Set<string>();
    for (const tags of Object.values(tagsByClient)) {
      for (const t of tags) names.add(t.name);
    }
    return [...names].sort();
  }, [tagsByClient]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (needle && !c.name.toLowerCase().includes(needle) && !c.email.toLowerCase().includes(needle)) {
        return false;
      }
      if (tagFilter && !tagsByClient[c.id]?.some((t) => t.name === tagFilter)) return false;
      return true;
    });
  }, [clients, query, tagFilter, tagsByClient]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    });
    setBusy(false);
    if (res.ok) {
      const client = await res.json();
      router.push(`/admin/clients/${client.id}`);
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'Failed to create client.');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Clients</h1>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border border-neutral-900 px-4 py-1.5 text-xs tracking-widest uppercase transition-colors hover:bg-neutral-900 hover:text-white dark:border-neutral-100 dark:hover:bg-neutral-100 dark:hover:text-black"
        >
          New client
        </button>
      </div>

      <div className="mb-6 space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or email"
          className="w-full max-w-sm border-b border-neutral-300 bg-transparent py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
        />
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allTags.map((tagName) => (
              <button
                key={tagName}
                type="button"
                onClick={() => setTagFilter(tagFilter === tagName ? null : tagName)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  tagFilter === tagName
                    ? 'border-neutral-900 dark:border-neutral-100'
                    : 'border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400'
                }`}
              >
                {tagName}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No clients yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {filtered.map((c) => (
            <li key={c.id}>
              <a
                href={`/admin/clients/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-2 py-3 hover:text-accent dark:hover:text-accent-dark"
              >
                <div>
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-sm text-neutral-500 dark:text-neutral-400">{c.email}</span>
                  {c.phone && (
                    <span className="ml-2 text-sm text-neutral-500 dark:text-neutral-400">{c.phone}</span>
                  )}
                </div>
                <div className="flex gap-1">
                  {tagsByClient[c.id]?.map((t) => (
                    <span
                      key={t.id}
                      className="rounded-full border border-neutral-300 px-2 py-0.5 text-[10px] text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-6">
          <form
            onSubmit={submit}
            className="w-full max-w-sm bg-[#fafafa] p-8 dark:bg-[#111]"
          >
            <h2 className="text-sm font-medium tracking-widest uppercase">New client</h2>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              autoFocus
              className="mt-6 w-full border-b border-neutral-300 bg-transparent py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="mt-4 w-full border-b border-neutral-300 bg-transparent py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
            />
            {error && <p className="mt-4 text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={busy || !name.trim() || !email.trim()}
                className="flex-1 border border-neutral-900 py-2 text-xs tracking-widest uppercase transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-40 dark:border-neutral-100 dark:hover:bg-neutral-100 dark:hover:text-black"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
