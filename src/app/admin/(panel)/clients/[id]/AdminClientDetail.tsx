'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Client } from '@/db/schema';

const inputClass =
  'w-full border-b border-neutral-300 bg-transparent py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100';

export default function AdminClientDetail({
  client,
  galleries,
  initialTags,
}: {
  client: Client;
  galleries: { id: string; title: string; type: string; deliveryState: string }[];
  initialTags: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [tags, setTags] = useState(initialTags);
  const [tagInput, setTagInput] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      router.refresh();
    }
  }

  async function addTag() {
    if (!tagInput.trim()) return;
    const res = await fetch(`/api/admin/clients/${client.id}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagName: tagInput.trim() }),
    });
    if (res.ok) {
      const { tagId } = await res.json();
      setTags((prev) => [...prev, { id: tagId, name: tagInput.trim() }]);
      setTagInput('');
    }
  }

  async function removeTag(tagId: string) {
    const res = await fetch(`/api/admin/clients/${client.id}/tags`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagId }),
    });
    if (res.ok) setTags((prev) => prev.filter((t) => t.id !== tagId));
  }

  async function deleteClient() {
    if (!confirm(`Delete client "${client.name}"? Their galleries stay, just unlinked.`)) return;
    const res = await fetch(`/api/admin/clients/${client.id}`, { method: 'DELETE' });
    if (res.ok) router.push('/admin/clients');
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">{client.name}</h1>
        {savedFlash && <span className="text-xs text-neutral-400">Saved</span>}
      </div>

      <section className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Name</span>
          <input
            type="text"
            defaultValue={client.name}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== client.name) {
                patch({ name: e.target.value.trim() });
              }
            }}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Email</span>
          <input
            type="email"
            defaultValue={client.email}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== client.email) {
                patch({ email: e.target.value.trim() });
              }
            }}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Phone</span>
          <input
            type="text"
            defaultValue={client.phone ?? ''}
            onBlur={(e) => {
              if (e.target.value !== (client.phone ?? '')) patch({ phone: e.target.value });
            }}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Notes</span>
          <textarea
            defaultValue={client.notes ?? ''}
            rows={5}
            onBlur={(e) => {
              if (e.target.value !== (client.notes ?? '')) patch({ notes: e.target.value });
            }}
            className="w-full rounded border border-neutral-300 bg-transparent p-2 text-sm outline-none dark:border-neutral-700"
          />
        </label>
      </section>

      <section>
        <span className="mb-2 block text-xs text-neutral-500 dark:text-neutral-400">Tags</span>
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs dark:border-neutral-700"
            >
              {t.name}
              <button
                type="button"
                onClick={() => removeTag(t.id)}
                aria-label={`Remove tag ${t.name}`}
                className="text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
              >
                &times;
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void addTag();
              }
            }}
            placeholder="Add tag"
            className="w-24 border-b border-neutral-300 bg-transparent py-0.5 text-xs outline-none dark:border-neutral-700"
          />
        </div>
      </section>

      <section>
        <span className="mb-2 block text-xs text-neutral-500 dark:text-neutral-400">Galleries</span>
        {galleries.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No galleries linked yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {galleries.map((g) => (
              <li key={g.id}>
                <a
                  href={`/admin/galleries/${g.id}`}
                  className="flex items-center justify-between gap-2 py-2 text-sm hover:text-accent dark:hover:text-accent-dark"
                >
                  <span>{g.title}</span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    {g.type} · {g.deliveryState}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={deleteClient}
        className="text-xs text-red-600 hover:underline dark:text-red-400"
      >
        Delete client
      </button>
    </div>
  );
}
