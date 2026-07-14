'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Gallery, Photo } from '@/db/schema';
import SegmentedControl from '@/components/SegmentedControl';
import ToggleSwitch from '@/components/ToggleSwitch';

type Section = { id: string; title: string; sortOrder: number };

export function AdminExtraSettings({
  gallery,
  patchGallery,
}: {
  gallery: Gallery;
  patchGallery: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const isClient = gallery.type === 'client';
  return (
    <div className="space-y-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <h2 className="text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
        Extended settings
      </h2>
      <SegmentedControl
        label="Comments"
        hint="Public per-photo comments"
        value={gallery.commentsMode}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'post', label: 'Post' },
          { value: 'pre', label: 'Pre-mod' },
        ]}
        onChange={(v) => patchGallery({ commentsMode: v })}
      />
      <ToggleSwitch
        label="Show EXIF in lightbox"
        checked={gallery.showExif}
        onChange={(v) => patchGallery({ showExif: v })}
      />
      <ToggleSwitch
        label="Show location"
        checked={gallery.showLocation}
        onChange={(v) => patchGallery({ showLocation: v })}
      />
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-neutral-500">Location name</span>
        <input
          type="text"
          defaultValue={gallery.locationName ?? ''}
          onBlur={(e) => patchGallery({ locationName: e.target.value.trim() || null })}
          className="w-full border-b border-neutral-300 bg-transparent py-1.5 dark:border-neutral-700"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Latitude</span>
          <input
            type="text"
            defaultValue={gallery.locationLat ?? ''}
            onBlur={(e) => patchGallery({ locationLat: e.target.value.trim() || null })}
            className="w-full border-b border-neutral-300 bg-transparent py-1.5 dark:border-neutral-700"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Longitude</span>
          <input
            type="text"
            defaultValue={gallery.locationLng ?? ''}
            onBlur={(e) => patchGallery({ locationLng: e.target.value.trim() || null })}
            className="w-full border-b border-neutral-300 bg-transparent py-1.5 dark:border-neutral-700"
          />
        </label>
      </div>
      {!isClient && (
        <ToggleSwitch
          label="Social / OG preview"
          checked={gallery.socialPreview}
          onChange={(v) => patchGallery({ socialPreview: v })}
        />
      )}
      {isClient && (
        <>
          <ToggleSwitch
            label="Favorites ZIP download"
            checked={gallery.favoritesDownloadEnabled}
            onChange={(v) => patchGallery({ favoritesDownloadEnabled: v })}
          />
          <ToggleSwitch
            label="Auto-expire gallery"
            checked={gallery.autoExpire}
            onChange={(v) => patchGallery({ autoExpire: v })}
          />
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Expires at</span>
            <input
              type="datetime-local"
              defaultValue={
                gallery.expiresAt
                  ? new Date(gallery.expiresAt).toISOString().slice(0, 16)
                  : ''
              }
              onChange={(e) =>
                patchGallery({
                  expiresAt: e.target.value ? new Date(e.target.value).getTime() : null,
                })
              }
              className="w-full border-b border-neutral-300 bg-transparent py-1.5 dark:border-neutral-700"
            />
          </label>
          <ToggleSwitch
            label="Limit selections"
            checked={gallery.limitSelections}
            onChange={(v) => patchGallery({ limitSelections: v })}
          />
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Selection limit</span>
            <input
              type="number"
              min={1}
              defaultValue={gallery.selectionLimit ?? ''}
              onBlur={(e) =>
                patchGallery({
                  selectionLimit: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
              className="w-full border-b border-neutral-300 bg-transparent py-1.5 dark:border-neutral-700"
            />
          </label>
        </>
      )}
      <ToggleSwitch
        label="Track downloads"
        checked={gallery.trackDownloads}
        onChange={(v) => patchGallery({ trackDownloads: v })}
      />
      <div className="grid grid-cols-3 gap-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">WM position</span>
          <select
            defaultValue={gallery.watermarkPosition}
            onChange={(e) => patchGallery({ watermarkPosition: e.target.value })}
            className="w-full border-b border-neutral-300 bg-transparent py-1 dark:border-neutral-700"
          >
            <option value="br">Bottom right</option>
            <option value="bl">Bottom left</option>
            <option value="tr">Top right</option>
            <option value="tl">Top left</option>
            <option value="center">Center</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">Opacity %</span>
          <input
            type="number"
            min={0}
            max={100}
            defaultValue={gallery.watermarkOpacity}
            onBlur={(e) => patchGallery({ watermarkOpacity: parseInt(e.target.value, 10) })}
            className="w-full border-b border-neutral-300 bg-transparent py-1 dark:border-neutral-700"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">Scale %</span>
          <input
            type="number"
            min={5}
            max={100}
            defaultValue={gallery.watermarkScale}
            onBlur={(e) => patchGallery({ watermarkScale: parseInt(e.target.value, 10) })}
            className="w-full border-b border-neutral-300 bg-transparent py-1 dark:border-neutral-700"
          />
        </label>
      </div>
      <div className="text-sm">
        <span className="mb-1 block text-xs text-neutral-500">Gallery watermark PNG</span>
        <input
          type="file"
          accept="image/png"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const form = new FormData();
            form.append('file', file);
            await fetch(`/api/admin/galleries/${gallery.id}/watermark`, {
              method: 'POST',
              body: form,
            });
          }}
        />
      </div>
      <a
        href={
          gallery.type === 'client'
            ? `/g/${gallery.slug}?preview=1`
            : `/portfolio/${gallery.slug}?preview=1`
        }
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block border border-neutral-300 px-3 py-1.5 text-xs tracking-widest uppercase dark:border-neutral-700"
      >
        Preview as client
      </a>
    </div>
  );
}

export function AdminSectionsPanel({
  galleryId,
  photos,
  onPhotosChange,
}: {
  galleryId: string;
  photos: Photo[];
  onPhotosChange: (photos: Photo[]) => void;
}) {
  const [sections, setSections] = useState<Section[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [folderSections, setFolderSections] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/galleries/${galleryId}/sections`);
    if (res.ok) setSections(await res.json());
  }, [galleryId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSection() {
    if (!newTitle.trim()) return;
    await fetch(`/api/admin/galleries/${galleryId}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    setNewTitle('');
    await load();
  }

  async function bulk(action: string, extra: Record<string, unknown> = {}) {
    if (selected.size === 0) return;
    if (action === 'delete' && !confirm(`Delete ${selected.size} photos?`)) return;
    await fetch(`/api/admin/galleries/${galleryId}/photos/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, photoIds: [...selected], ...extra }),
    });
    setSelected(new Set());
    const res = await fetch(`/api/admin/galleries/${galleryId}/photos`);
    if (res.ok) onPhotosChange(await res.json());
  }

  async function sortPhotos(mode: string, sectionId: string | null) {
    await fetch(`/api/admin/galleries/${galleryId}/photos/sort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, sectionId }),
    });
    const res = await fetch(`/api/admin/galleries/${galleryId}/photos`);
    if (res.ok) onPhotosChange(await res.json());
  }

  return (
    <div className="space-y-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <h2 className="text-xs tracking-widest text-neutral-500 uppercase">Sections & bulk</h2>
      <div className="flex flex-wrap gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New section title"
          className="border-b border-neutral-300 bg-transparent py-1 text-sm dark:border-neutral-700"
        />
        <button type="button" onClick={createSection} className="border px-2 py-1 text-xs">
          Add section
        </button>
      </div>
      <ul className="space-y-1 text-xs">
        {sections.map((s) => (
          <li key={s.id}>
            {s.title}{' '}
            <button
              type="button"
              className="underline"
              onClick={() =>
                bulk('move', { sectionId: s.id }).then(async () => {
                  const r = await fetch(`/api/admin/galleries/${galleryId}/photos`);
                  if (r.ok) onPhotosChange(await r.json());
                })
              }
            >
              move selected here
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" onClick={() => sortPhotos('filename', null)}>
          Sort filename
        </button>
        <button type="button" onClick={() => sortPhotos('capture', null)}>
          Sort capture date
        </button>
        <button type="button" onClick={() => sortPhotos('upload', null)}>
          Sort upload date
        </button>
        <button type="button" onClick={() => bulk('cover')} disabled={selected.size !== 1}>
          Set cover
        </button>
        <button type="button" onClick={() => bulk('delete')}>
          Delete selected ({selected.size})
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={folderSections}
          onChange={(e) => setFolderSections(e.target.checked)}
        />
        Create sections from subfolders on folder upload
      </label>
      <p className="text-xs text-neutral-500">
        Shift-click photos in the grid below to multi-select (checkbox mode via click).
      </p>
      <div className="flex flex-wrap gap-1">
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={(e) => {
              setSelected((prev) => {
                const next = new Set(prev);
                if (e.shiftKey && prev.size > 0) {
                  next.add(p.id);
                } else if (next.has(p.id)) next.delete(p.id);
                else next.add(p.id);
                return next;
              });
            }}
            className={`border px-1 text-[10px] ${selected.has(p.id) ? 'border-neutral-900 dark:border-neutral-100' : 'border-transparent'}`}
          >
            {p.filename.slice(0, 12)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AdminCommentsPanel({ galleryId }: { galleryId: string }) {
  const [comments, setComments] = useState<
    { id: string; photoId: string; authorName: string; body: string; status: string }[]
  >([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch(`/api/admin/galleries/${galleryId}/comments?status=${filter}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setComments(d?.comments ?? []));
  }, [galleryId, filter]);

  return (
    <div className="space-y-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <h2 className="text-xs tracking-widest text-neutral-500 uppercase">Comments</h2>
      <select value={filter} onChange={(e) => setFilter(e.target.value)} className="text-xs">
        <option value="all">All</option>
        <option value="pending">Pending</option>
        <option value="visible">Visible</option>
      </select>
      <ul className="space-y-2 text-xs">
        {comments.map((c) => (
          <li key={c.id} className="border-l-2 border-neutral-300 pl-2 dark:border-neutral-700">
            <strong>{c.authorName}</strong> · {c.status}
            <p className="text-neutral-600 dark:text-neutral-300">{c.body}</p>
            {c.status === 'pending' && (
              <button
                type="button"
                className="mr-2 underline"
                onClick={() =>
                  fetch(`/api/admin/comments/${c.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'visible' }),
                  }).then(() => setFilter((f) => f))
                }
              >
                Approve
              </button>
            )}
            <button
              type="button"
              className="underline"
              onClick={() =>
                fetch(`/api/admin/comments/${c.id}`, { method: 'DELETE' }).then(() =>
                  setFilter((f) => f),
                )
              }
            >
              Hide
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
