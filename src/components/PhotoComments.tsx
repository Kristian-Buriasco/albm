'use client';

import { useCallback, useEffect, useState } from 'react';

export type CommentItem = {
  id: string;
  authorName: string;
  body: string;
  isPhotographer: boolean;
  status: 'visible' | 'pending';
  createdAt: number;
  own?: boolean;
};

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function PhotoComments({
  apiBase,
  photoId,
  enabled,
}: {
  apiBase: string;
  photoId: string;
  enabled: boolean;
}) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    const res = await fetch(`${apiBase}?photoId=${encodeURIComponent(photoId)}`);
    if (!res.ok) return;
    const data = await res.json();
    setComments(data.comments ?? []);
    if (data.prefilledName) setName(data.prefilledName);
  }, [apiBase, photoId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!enabled) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId, body, name: name || undefined }),
    });
    setBusy(false);
    if (res.ok) {
      setBody('');
      await load();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'Could not post comment');
    }
  }

  async function remove(commentId: string) {
    const res = await fetch(apiBase, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentId }),
    });
    if (res.ok) await load();
  }

  return (
    <div className="mx-auto mt-4 max-w-lg px-4 pb-6 text-xs">
      {comments.length > 0 && (
        <ul className="mb-4 space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="border-l-2 border-neutral-700 pl-3 dark:border-neutral-600">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`font-medium ${c.isPhotographer ? 'text-neutral-300' : 'text-neutral-400'}`}
                >
                  {c.authorName}
                  {c.isPhotographer && (
                    <span className="ml-1.5 text-[10px] tracking-widest uppercase opacity-70">
                      Photographer
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-neutral-500">{relativeTime(c.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-neutral-300">{c.body}</p>
              {c.status === 'pending' && c.own && (
                <p className="mt-1 text-[10px] text-amber-400/90">Awaiting approval</p>
              )}
              {c.own && !c.isPhotographer && (
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="mt-1 text-[10px] text-neutral-500 underline"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={80}
          className="w-full border-b border-neutral-700 bg-transparent py-1 text-neutral-300 outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          maxLength={2000}
          rows={2}
          className="w-full resize-none border border-neutral-800 bg-neutral-950/40 px-2 py-1.5 text-neutral-300 outline-none"
        />
        {error && <p className="text-[10px] text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="text-[10px] tracking-widest uppercase text-neutral-400 hover:text-white disabled:opacity-40"
        >
          {busy ? 'Posting…' : 'Post comment'}
        </button>
      </form>
    </div>
  );
}
