'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateGalleryButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'client' | 'portfolio'>('client');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/admin/galleries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, type }),
    });
    setBusy(false);
    if (res.ok) {
      const gallery = await res.json();
      router.push(`/admin/galleries/${gallery.id}`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'Failed to create gallery.');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border border-neutral-900 px-4 py-1.5 text-xs tracking-widest uppercase transition-colors hover:bg-neutral-900 hover:text-white dark:border-neutral-100 dark:hover:bg-neutral-100 dark:hover:text-black"
      >
        New gallery
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-6">
          <form
            onSubmit={submit}
            className="w-full max-w-sm bg-[#fafafa] p-8 dark:bg-[#111]"
          >
            <h2 className="text-sm font-medium tracking-widest uppercase">
              New gallery
            </h2>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              autoFocus
              className="mt-6 w-full border-b border-neutral-300 bg-transparent py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
            />
            <div className="mt-4 flex gap-4 text-xs">
              {(['client', 'portfolio'] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="type"
                    checked={type === t}
                    onChange={() => setType(t)}
                  />
                  {t === 'client' ? 'Client gallery' : 'Portfolio'}
                </label>
              ))}
            </div>
            {error && (
              <p className="mt-4 text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={busy || !title.trim()}
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
    </>
  );
}
