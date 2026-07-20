'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Row = {
  id: string;
  galleryId: string;
  galleryTitle: string;
  visitorId: string | null;
  rating: number;
  quote: string;
  authorName: string;
  status: 'pending' | 'approved' | 'hidden';
  createdAt: number;
  approvedAt: number | null;
};

export default function AdminTestimonialsClient({ testimonials }: { testimonials: Row[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Row['status']>('pending');

  async function setStatus(id: string, status: 'approved' | 'hidden') {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/testimonials/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const visible = testimonials.filter((t) => filter === 'all' || t.status === filter);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-medium tracking-widest uppercase">Testimonials</h1>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="border-b border-neutral-300 bg-transparent py-1 text-xs outline-none dark:border-neutral-700"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="hidden">Hidden</option>
          <option value="all">All</option>
        </select>
      </div>

      {visible.length === 0 && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No testimonials.</p>
      )}

      <ul className="space-y-4">
        {visible.map((t) => (
          <li
            key={t.id}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t.galleryTitle} &middot; {'★'.repeat(t.rating)}
                  {'☆'.repeat(5 - t.rating)} &middot;{' '}
                  {new Date(t.createdAt).toLocaleDateString()}
                </p>
                <p className="mt-2 text-sm whitespace-pre-wrap">{t.quote}</p>
                <p className="mt-2 text-xs font-medium">{t.authorName}</p>
                <p className="mt-1 text-[10px] tracking-widest text-neutral-400 uppercase">
                  {t.status}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {t.status !== 'approved' && (
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => setStatus(t.id, 'approved')}
                    className="rounded border border-neutral-300 px-3 py-1.5 text-xs uppercase disabled:opacity-50 dark:border-neutral-700"
                  >
                    Approve
                  </button>
                )}
                {t.status !== 'hidden' && (
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => setStatus(t.id, 'hidden')}
                    className="rounded border border-neutral-300 px-3 py-1.5 text-xs uppercase disabled:opacity-50 dark:border-neutral-700"
                  >
                    Hide
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
