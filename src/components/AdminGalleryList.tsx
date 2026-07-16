'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatBytes } from '@/lib/format-bytes';

export type GalleryListRow = {
  id: string;
  title: string;
  type: 'client' | 'portfolio';
  published: boolean;
  expiresAt: number | null;
  photoCount: number;
  sizeBytes: number;
  expired: boolean;
  folderId: string | null;
};

export type FolderRow = {
  id: string;
  name: string;
  sortOrder: number;
};

type Filter = 'all' | 'portfolio' | 'client' | 'published' | 'unpublished' | 'expired';

function GalleryRow({ r }: { r: GalleryListRow }) {
  return (
    <Link
      href={`/admin/galleries/${r.id}`}
      className="flex items-center justify-between gap-4 py-3 pl-4 transition-colors hover:bg-neutral-100/60 dark:hover:bg-neutral-900/60"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{r.title}</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          {r.type === 'portfolio' ? 'Portfolio' : 'Client'} · {r.photoCount} photos ·{' '}
          {formatBytes(r.sizeBytes)}
          {r.expired ? ' · Expired' : ''}
        </p>
      </div>
      <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px]">
        {r.published ? 'Published' : 'Draft'}
      </span>
    </Link>
  );
}

export default function AdminGalleryList({
  rows,
  initialFolders,
}: {
  rows: GalleryListRow[];
  initialFolders: FolderRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [folders, setFolders] = useState(initialFolders);
  const [newFolderName, setNewFolderName] = useState('');
  const filter = (searchParams.get('filter') as Filter) || 'all';

  useEffect(() => {
    setFolders(initialFolders);
  }, [initialFolders]);

  function setFilter(f: Filter) {
    const p = new URLSearchParams(searchParams.toString());
    if (f === 'all') p.delete('filter');
    else p.set('filter', f);
    router.replace(`/admin?${p.toString()}`);
  }

  function setQuery(val: string) {
    setQ(val);
    const p = new URLSearchParams(searchParams.toString());
    if (val.trim()) p.set('q', val.trim());
    else p.delete('q');
    router.replace(`/admin?${p.toString()}`);
  }

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle && !r.title.toLowerCase().includes(needle)) return false;
      if (filter === 'portfolio' && r.type !== 'portfolio') return false;
      if (filter === 'client' && r.type !== 'client') return false;
      if (filter === 'published' && !r.published) return false;
      if (filter === 'unpublished' && r.published) return false;
      if (filter === 'expired' && !r.expired) return false;
      return true;
    });
  }, [rows, q, filter]);

  const grouped = useMemo(() => {
    const byFolder = new Map<string | null, GalleryListRow[]>();
    for (const r of visible) {
      const key = r.folderId;
      byFolder.set(key, [...(byFolder.get(key) ?? []), r]);
    }
    return byFolder;
  }, [visible]);

  const ungrouped = grouped.get(null) ?? [];

  async function createFolder() {
    if (!newFolderName.trim()) return;
    const res = await fetch('/api/admin/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName.trim() }),
    });
    if (res.ok) {
      const folder = await res.json();
      setFolders((f) => [...f, folder]);
      setNewFolderName('');
      router.refresh();
    }
  }

  async function deleteFolder(id: string, name: string) {
    if (!confirm(`Delete folder "${name}"? Galleries will become ungrouped.`)) return;
    await fetch(`/api/admin/folders/${id}`, { method: 'DELETE' });
    setFolders((f) => f.filter((x) => x.id !== id));
    router.refresh();
  }

  async function assignFolder(galleryId: string, folderId: string | null) {
    await fetch(`/api/admin/galleries/${galleryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
    router.refresh();
  }

  const chips: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'portfolio', label: 'Portfolio' },
    { key: 'client', label: 'Client' },
    { key: 'published', label: 'Published' },
    { key: 'unpublished', label: 'Unpublished' },
    { key: 'expired', label: 'Expired' },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search galleries…"
          className="min-w-[12rem] border-b border-neutral-300 bg-transparent py-1 text-sm outline-none dark:border-neutral-700"
        />
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                filter === c.key
                  ? 'border-neutral-900 dark:border-neutral-100'
                  : 'border-neutral-300 dark:border-neutral-700'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-2 text-xs">
        <input
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder="New folder name"
          className="border-b border-neutral-300 bg-transparent py-1 dark:border-neutral-700"
        />
        <button type="button" onClick={createFolder} className="underline">
          Add folder
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-500">No galleries match.</p>
      ) : (
        <div className="space-y-8">
          {folders.map((folder) => {
            const items = grouped.get(folder.id) ?? [];
            if (items.length === 0 && q.trim()) return null;
            return (
              <div key={folder.id}>
                <div className="mb-2 flex items-center justify-between border-b border-neutral-200 pb-1 dark:border-neutral-800">
                  <h3 className="text-xs font-medium tracking-widest uppercase">{folder.name}</h3>
                  <button
                    type="button"
                    onClick={() => deleteFolder(folder.id, folder.name)}
                    className="text-[10px] text-neutral-500 underline"
                  >
                    Delete folder
                  </button>
                </div>
                {items.length === 0 ? (
                  <p className="py-2 pl-4 text-xs text-neutral-500">Empty folder</p>
                ) : (
                  <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
                    {items.map((r) => (
                      <li key={r.id} className="flex items-center gap-2">
                        <select
                          value={r.folderId ?? ''}
                          onChange={(e) =>
                            assignFolder(r.id, e.target.value ? e.target.value : null)
                          }
                          className="ml-1 w-28 shrink-0 border-none bg-transparent text-[10px] text-neutral-500"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">Ungrouped</option>
                          {folders.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                        <div className="min-w-0 flex-1">
                          <GalleryRow r={r} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {(ungrouped.length > 0 || folders.length === 0) && (
            <div>
              <h3 className="mb-2 border-b border-neutral-200 pb-1 text-xs font-medium tracking-widest uppercase dark:border-neutral-800">
                Ungrouped
              </h3>
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {ungrouped.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    {folders.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => assignFolder(r.id, e.target.value || null)}
                        className="ml-1 w-28 shrink-0 border-none bg-transparent text-[10px] text-neutral-500"
                      >
                        <option value="">Ungrouped</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="min-w-0 flex-1">
                      <GalleryRow r={r} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
