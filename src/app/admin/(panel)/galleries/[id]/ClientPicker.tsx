'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Client } from '@/db/schema';

/**
 * Type-to-filter picker for linking a gallery to a Client record (optional,
 * set after gallery creation). Fetches the full client list once on mount —
 * fine at the scale a single photographer's client list runs at.
 */
export default function ClientPicker({
  clientId,
  onChange,
}: {
  clientId: string | null;
  onChange: (clientId: string | null) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/admin/clients')
      .then((r) => (r.ok ? r.json() : []))
      .then(setClients)
      .catch(() => {});
  }, []);

  const current = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clients.slice(0, 8);
    return clients
      .filter((c) => c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [clients, query]);

  async function createAndSelect(name: string) {
    const res = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email: '' }),
    });
    if (res.ok) {
      const client = await res.json();
      setClients((prev) => [...prev, client]);
      onChange(client.id);
      setOpen(false);
      setQuery('');
    }
  }

  if (current && !open) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <a
          href={`/admin/clients/${current.id}`}
          className="text-accent hover:underline dark:text-accent-dark"
        >
          {current.name}
        </a>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          Change
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400"
        >
          Unlink
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search or create a client…"
        className="w-full border-b border-neutral-300 bg-transparent py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
          {matches.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange(c.id);
                setOpen(false);
                setQuery('');
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              {c.name} <span className="text-neutral-400">{c.email}</span>
            </button>
          ))}
          {query.trim() && (
            <button
              type="button"
              onClick={() => createAndSelect(query.trim())}
              className="block w-full border-t border-neutral-200 px-3 py-2 text-left text-sm text-accent hover:bg-neutral-100 dark:border-neutral-800 dark:text-accent-dark dark:hover:bg-neutral-800"
            >
              + Create client &quot;{query.trim()}&quot;
            </button>
          )}
          {current && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="block w-full border-t border-neutral-200 px-3 py-2 text-left text-xs text-neutral-500 dark:border-neutral-800"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
