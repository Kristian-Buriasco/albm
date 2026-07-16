'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Gallery, Photo } from '@/db/schema';
import SegmentedControl from '@/components/SegmentedControl';
import ToggleSwitch from '@/components/ToggleSwitch';
import { coverObjectPosition } from '@/lib/cover-focus';

type Section = { id: string; title: string; sortOrder: number };
type Tag = { id: string; name: string };

function AdminSelectableThumb({
  photo,
  selected,
  tags,
  onToggle,
}: {
  photo: Photo;
  selected: boolean;
  tags?: { id: string; name: string }[];
  onToggle: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative w-[140px] shrink-0 overflow-hidden rounded border-2 transition-all ${
        selected
          ? 'border-accent ring-2 ring-accent/40 dark:border-accent-dark dark:ring-accent-dark/40'
          : 'border-transparent hover:border-neutral-300 dark:hover:border-neutral-600'
      }`}
    >
      <div className={`aspect-square w-full ${selected ? 'opacity-75' : ''}`}>
        {photo.status === 'ready' ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/img/${photo.id}/thumb?v=${photo.updatedAt}`}
            alt={photo.filename}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-[10px] text-neutral-400 dark:bg-neutral-900">
            {photo.status}
          </div>
        )}
      </div>
      {selected && (
        <span className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white dark:bg-accent-dark">
          ✓
        </span>
      )}
      {tags && tags.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-0.5 bg-black/60 p-1">
          {tags.slice(0, 2).map((t) => (
            <span key={t.id} className="rounded bg-white/20 px-1 text-[8px] text-white">
              {t.name}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function PhotoPicker({
  galleryId,
  field,
  currentId,
  label,
  hint,
  clearLabel,
  patchGallery,
}: {
  galleryId: string;
  field: 'coverPhotoId' | 'previewPhotoId';
  currentId: string | null;
  label: string;
  hint: string;
  clearLabel: string;
  patchGallery: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selected, setSelected] = useState<string | null>(currentId);

  useEffect(() => {
    fetch(`/api/admin/galleries/${galleryId}/photos`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Photo[]) =>
        setPhotos(Array.isArray(data) ? data.filter((p) => p.status === 'ready') : []),
      )
      .catch(() => {});
  }, [galleryId]);

  async function pick(id: string | null) {
    const ok = await patchGallery({ [field]: id });
    if (ok) setSelected(id);
  }

  if (photos.length === 0) return null;

  return (
    <div className="mt-1">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs text-neutral-500">{label}</span>
        {selected && (
          <button
            type="button"
            onClick={() => pick(null)}
            className="text-[11px] text-accent dark:text-accent-dark"
          >
            {clearLabel}
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => pick(p.id)}
            className={`relative aspect-square w-16 shrink-0 overflow-hidden rounded border-2 transition-all ${
              selected === p.id
                ? 'border-accent ring-2 ring-accent/40 dark:border-accent-dark'
                : 'border-transparent hover:border-neutral-300 dark:hover:border-neutral-600'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/img/${p.id}/thumb?v=${p.updatedAt}`}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
            {selected === p.id && (
              <span className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white dark:bg-accent-dark">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-neutral-400">{hint}</p>
    </div>
  );
}

function CoverFocusPicker({
  gallery,
  photos,
  patchGallery,
}: {
  gallery: Gallery;
  photos: Photo[];
  patchGallery: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const coverId = gallery.coverPhotoId ?? photos.find((p) => p.status === 'ready')?.id;
  const cover = photos.find((p) => p.id === coverId && p.status === 'ready');
  if (!cover) return null;

  async function setFocus(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    await patchGallery({ coverFocusX: x, coverFocusY: y });
  }

  return (
    <div className="text-sm">
      <span className="mb-1 block text-xs text-neutral-500">Cover focal point</span>
      <button
        type="button"
        onClick={setFocus}
        className="relative block aspect-[4/3] w-full max-w-xs overflow-hidden rounded border border-neutral-300 dark:border-neutral-700"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/img/${cover.id}/thumb?v=${cover.updatedAt}`}
          alt="Cover preview"
          className="h-full w-full object-cover"
          style={{
            objectPosition: coverObjectPosition(gallery.coverFocusX, gallery.coverFocusY),
          }}
        />
        <span
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow dark:bg-accent-dark"
          style={{
            left: `${gallery.coverFocusX}%`,
            top: `${gallery.coverFocusY}%`,
          }}
        />
      </button>
      <p className="mt-1 text-[11px] text-neutral-400">Click to set where square crops should focus.</p>
    </div>
  );
}

export function AdminGalleryTags({
  galleryId,
}: {
  galleryId: string;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [input, setInput] = useState('');

  const load = useCallback(async () => {
    const [gRes, tRes] = await Promise.all([
      fetch(`/api/admin/galleries/${galleryId}/tags`),
      fetch('/api/admin/tags'),
    ]);
    if (gRes.ok) setTags((await gRes.json()).tags ?? []);
    if (tRes.ok) setAllTags((await tRes.json()).tags ?? []);
  }, [galleryId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/admin/galleries/${galleryId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagName: trimmed }),
    });
    if (res.ok) {
      setInput('');
      await load();
    }
  }

  async function removeTag(tagId: string) {
    await fetch(`/api/admin/galleries/${galleryId}/tags`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagId }),
    });
    await load();
  }

  const suggestions = allTags.filter(
    (t) => !tags.some((g) => g.id === t.id) && t.name.toLowerCase().includes(input.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      <span className="block text-xs text-neutral-500">Gallery tags</span>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-2 py-0.5 text-xs dark:border-neutral-700"
          >
            {t.name}
            <button type="button" onClick={() => removeTag(t.id)} className="text-neutral-400 hover:text-red-500">
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void addTag(input);
            }
          }}
          placeholder="Add tag…"
          maxLength={40}
          className="w-full max-w-xs border-b border-neutral-300 bg-transparent py-1 text-sm dark:border-neutral-700"
        />
        {input && suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full max-w-xs border border-neutral-200 bg-white text-xs shadow dark:border-neutral-800 dark:bg-neutral-900">
            {suggestions.slice(0, 8).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="block w-full px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  onClick={() => addTag(t.name)}
                >
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function AdminExtraSettings({
  gallery,
  photos,
  patchGallery,
}: {
  gallery: Gallery;
  photos: Photo[];
  patchGallery: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const isClient = gallery.type === 'client';
  return (
    <div className="space-y-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <h2 className="text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
        Extended settings
      </h2>
      <PhotoPicker
        galleryId={gallery.id}
        field="coverPhotoId"
        currentId={gallery.coverPhotoId}
        label="Cover photo (shown on the site)"
        hint="Pick which photo represents this gallery on the homepage and grids. Defaults to the first photo."
        clearLabel="Use first photo"
        patchGallery={patchGallery}
      />
      <CoverFocusPicker gallery={gallery} photos={photos} patchGallery={patchGallery} />
      <AdminGalleryTags galleryId={gallery.id} />
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
      <ToggleSwitch
        label={
          isClient
            ? 'Link preview (show cover when the album link is shared)'
            : 'Social / OG preview'
        }
        checked={gallery.socialPreview}
        onChange={(v) => patchGallery({ socialPreview: v })}
      />
      {isClient && (
        <p className="-mt-1 text-[11px] text-neutral-400">
          Shows a preview in chat apps when you share the link. Works for
          published galleries without a password (the gallery still isn&apos;t
          search-indexed).
        </p>
      )}
      {gallery.socialPreview && (
        <PhotoPicker
          galleryId={gallery.id}
          field="previewPhotoId"
          currentId={gallery.previewPhotoId}
          label="Link preview photo"
          hint="Pick which photo shows when the link is shared. Defaults to the cover."
          clearLabel="Use cover"
          patchGallery={patchGallery}
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
      {isClient && (
        <>
          <ToggleSwitch
            label="Auto-publish on upload (live)"
            checked={gallery.autoPublishOnUpload}
            onChange={(v) => patchGallery({ autoPublishOnUpload: v })}
          />
          <p className="-mt-1 text-[11px] text-neutral-400">
            Publish API uploads publish the gallery automatically. Client view polls for new
            photos. Derivative queue is concurrency-1 — bursts may backlog.
          </p>
          <ToggleSwitch
            label="Deliver RAW originals to clients"
            checked={gallery.deliverRaw}
            onChange={(v) => patchGallery({ deliverRaw: v })}
          />
          <p className="-mt-1 text-[11px] text-neutral-400">
            Off (default): clients get the processed JPEG. On: clients can download the archived
            RAW file.
          </p>
          <ToggleSwitch
            label="Forensic watermark on download"
            checked={gallery.forensicWatermark}
            onChange={(v) => patchGallery({ forensicWatermark: v })}
          />
          <p className="-mt-1 text-[11px] text-neutral-400">
            Invisible per-download mark for leak tracing. Off = byte-identical downloads (aside from
            GPS strip). Decode tool: Admin → Forensic decode.
          </p>
          <div className="space-y-2 rounded border border-neutral-200 p-3 dark:border-neutral-800">
            <p className="text-xs font-medium text-neutral-500">Download sizes offered</p>
            <ToggleSwitch
              label="Web"
              checked={gallery.downloadOfferWeb}
              onChange={(v) => patchGallery({ downloadOfferWeb: v })}
            />
            <ToggleSwitch
              label="Print (3000px)"
              checked={gallery.downloadOfferPrint}
              onChange={(v) => patchGallery({ downloadOfferPrint: v })}
            />
            <ToggleSwitch
              label="Original"
              checked={gallery.downloadOfferOriginal}
              onChange={(v) => patchGallery({ downloadOfferOriginal: v })}
            />
          </div>
          <ToggleSwitch
            label="Keep EXIF on download (non-GPS)"
            checked={gallery.keepExifOnDownload}
            onChange={(v) => patchGallery({ keepExifOnDownload: v })}
          />
          <ToggleSwitch
            label="Allow GPS in downloads"
            checked={gallery.allowGpsInDownload}
            onChange={(v) => patchGallery({ allowGpsInDownload: v })}
          />
          <p className="-mt-1 text-[11px] text-neutral-400">
            GPS is stripped by default. Enable both keep-EXIF and allow-GPS only when clients need
            location metadata.
          </p>
        </>
      )}
      {!isClient && (
        <>
          <ToggleSwitch
            label="Keep EXIF on download (non-GPS)"
            checked={gallery.keepExifOnDownload}
            onChange={(v) => patchGallery({ keepExifOnDownload: v })}
          />
          <ToggleSwitch
            label="Allow GPS in downloads"
            checked={gallery.allowGpsInDownload}
            onChange={(v) => patchGallery({ allowGpsInDownload: v })}
          />
        </>
      )}
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
  selected,
  onSelectedChange,
  onPhotosChange,
  onTogglePhoto,
}: {
  galleryId: string;
  photos: Photo[];
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  onPhotosChange: (photos: Photo[]) => void;
  onTogglePhoto: (photoId: string, e: React.MouseEvent) => void;
}) {
  const [sections, setSections] = useState<Section[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [photoTags, setPhotoTags] = useState<Record<string, Tag[]>>({});
  const [galleryTags, setGalleryTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [movePreview, setMovePreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [secRes, tagRes, allRes] = await Promise.all([
      fetch(`/api/admin/galleries/${galleryId}/sections`),
      fetch(`/api/admin/galleries/${galleryId}/tags`),
      fetch('/api/admin/tags'),
    ]);
    if (secRes.ok) setSections(await secRes.json());
    if (allRes.ok) setAllTags((await allRes.json()).tags ?? []);
    if (tagRes.ok) {
      const data = await tagRes.json();
      setGalleryTags(data.tags ?? []);
    }
    const ptRes = await fetch(`/api/admin/galleries/${galleryId}/photos?tags=1`);
    if (ptRes.ok) {
      const data = await ptRes.json();
      if (data.photoTags) setPhotoTags(data.photoTags);
    }
  }, [galleryId]);

  useEffect(() => {
    void load();
  }, [load, photos.length]);

  const filteredPhotos = useMemo(() => {
    if (!tagFilter) return photos;
    return photos.filter((p) => photoTags[p.id]?.some((t) => t.id === tagFilter));
  }, [photos, tagFilter, photoTags]);

  const photosBySection = useMemo(() => {
    const groups: { id: string | null; title: string; photos: Photo[] }[] = [];
    const ungrouped = filteredPhotos.filter((p) => !p.sectionId);
    if (ungrouped.length > 0) {
      groups.push({ id: null, title: 'Ungrouped', photos: ungrouped });
    }
    for (const s of sections) {
      const secPhotos = filteredPhotos.filter((p) => p.sectionId === s.id);
      if (secPhotos.length > 0) {
        groups.push({ id: s.id, title: s.title, photos: secPhotos });
      }
    }
    return groups;
  }, [filteredPhotos, sections]);

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

  async function renameSection(id: string, current: string) {
    const title = window.prompt('Rename section', current)?.trim();
    if (!title || title === current) return;
    await fetch(`/api/admin/galleries/${galleryId}/sections`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionId: id, title }),
    });
    await load();
  }

  async function moveSection(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= sections.length) return;
    const order = sections.map((s) => s.id);
    [order[index], order[next]] = [order[next], order[index]];
    // optimistic reorder
    const reordered = order.map((id) => sections.find((s) => s.id === id)!);
    setSections(reordered);
    await fetch(`/api/admin/galleries/${galleryId}/sections`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    });
    await load();
  }

  async function deleteSection(id: string, title: string) {
    if (!confirm(`Delete section "${title}"? Its photos become ungrouped.`)) return;
    await fetch(`/api/admin/galleries/${galleryId}/sections`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionId: id }),
    });
    const res = await fetch(`/api/admin/galleries/${galleryId}/photos`);
    if (res.ok) onPhotosChange(await res.json());
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
    onSelectedChange(new Set());
    setMovePreview(null);
    const res = await fetch(`/api/admin/galleries/${galleryId}/photos`);
    if (res.ok) onPhotosChange(await res.json());
    await load();
  }

  async function assignTag(tagName: string) {
    if (selected.size === 0) return;
    await fetch('/api/admin/photos/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds: [...selected], tagName }),
    });
    setTagInput('');
    await load();
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

  function selectAllVisible() {
    onSelectedChange(new Set(filteredPhotos.map((p) => p.id)));
  }

  function invertSelection() {
    onSelectedChange(
      new Set(filteredPhotos.filter((p) => !selected.has(p.id)).map((p) => p.id)),
    );
  }

  const selectedPhotos = photos.filter((p) => selected.has(p.id));

  return (
    <div className="space-y-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <h2 className="text-xs tracking-widest text-neutral-500 uppercase">
        Sections, tags & bulk
      </h2>

      {selected.size > 0 && (
        <div className="rounded border border-accent/30 bg-accent/5 p-3 dark:border-accent-dark/30 dark:bg-accent-dark/5">
          <p className="mb-2 text-xs font-medium">
            {selected.size} photo{selected.size === 1 ? '' : 's'} selected
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {selectedPhotos.map((p) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={p.id}
                src={`/img/${p.id}/thumb?v=${p.updatedAt}`}
                alt={p.filename}
                className="h-16 w-16 shrink-0 rounded object-cover"
              />
            ))}
          </div>
        </div>
      )}

      {movePreview && selected.size > 0 && (
        <div className="rounded border border-neutral-300 p-3 text-xs dark:border-neutral-700">
          Move {selected.size} photo{selected.size === 1 ? '' : 's'} to &ldquo;
          {sections.find((s) => s.id === movePreview)?.title ?? 'section'}&rdquo;?
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {selectedPhotos.slice(0, 8).map((p) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={p.id}
                src={`/img/${p.id}/thumb?v=${p.updatedAt}`}
                alt=""
                className="h-14 w-14 shrink-0 rounded object-cover"
              />
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="border px-2 py-1"
              onClick={() => {
                bulk('move', { sectionId: movePreview });
                setMovePreview(null);
              }}
            >
              Confirm move
            </button>
            <button type="button" className="underline" onClick={() => setMovePreview(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {galleryTags.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTagFilter(tagFilter === t.id ? null : t.id)}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              tagFilter === t.id
                ? 'border-accent bg-accent/10 dark:border-accent-dark'
                : 'border-neutral-300 dark:border-neutral-700'
            }`}
          >
            {t.name}
          </button>
        ))}
        {tagFilter && (
          <button type="button" onClick={() => setTagFilter(null)} className="text-xs underline">
            Clear filter
          </button>
        )}
      </div>

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

      <ul className="space-y-2 text-xs">
        {sections.map((s, i) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3">
            <span className="flex items-center">
              <button
                type="button"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => moveSection(i, -1)}
                className="px-1 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 dark:hover:text-neutral-100"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={i === sections.length - 1}
                onClick={() => moveSection(i, 1)}
                className="px-1 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 dark:hover:text-neutral-100"
              >
                ↓
              </button>
            </span>
            <span className="font-medium">{s.title}</span>
            <button
              type="button"
              className="text-accent hover:underline dark:text-accent-dark"
              onClick={() => renameSection(s.id, s.title)}
            >
              Rename
            </button>
            <button
              type="button"
              className="text-red-500 hover:underline"
              onClick={() => deleteSection(s.id, s.title)}
            >
              Delete
            </button>
            <button
              type="button"
              className="underline disabled:opacity-40"
              disabled={selected.size === 0}
              onClick={() => setMovePreview(s.id)}
            >
              Move selected here
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
        <button type="button" onClick={selectAllVisible} disabled={filteredPhotos.length === 0}>
          Select all visible
        </button>
        <button type="button" onClick={invertSelection} disabled={filteredPhotos.length === 0}>
          Invert
        </button>
        <button type="button" onClick={() => onSelectedChange(new Set())} disabled={selected.size === 0}>
          Clear selection
        </button>
        <button type="button" onClick={() => bulk('cover')} disabled={selected.size !== 1}>
          Set cover
        </button>
        <button type="button" onClick={() => bulk('delete')} disabled={selected.size === 0}>
          Delete selected
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="Add tag to selected…"
          maxLength={40}
          className="border-b border-neutral-300 bg-transparent py-1 dark:border-neutral-700"
        />
        <button
          type="button"
          disabled={!tagInput.trim() || selected.size === 0}
          onClick={() => assignTag(tagInput)}
        >
          Add tag
        </button>
        {allTags.slice(0, 6).map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={selected.size === 0}
            className="rounded border border-neutral-300 px-1.5 py-0.5 dark:border-neutral-700"
            onClick={() => assignTag(t.name)}
          >
            + {t.name}
          </button>
        ))}
      </div>

      {photos.length > 1 && (
        <p className="text-[11px] text-neutral-400">
          Tip: click to select, <kbd className="rounded border border-neutral-300 px-1 dark:border-neutral-700">Shift</kbd>-click to select a range.
        </p>
      )}
      {photosBySection.map((group) => (
        <div key={group.id ?? 'ungrouped'} className="space-y-2">
          <h3 className="text-xs font-medium tracking-widest text-neutral-500 uppercase">
            {group.title}
          </h3>
          <div className="flex flex-wrap gap-2">
            {group.photos.map((p) => (
              <AdminSelectableThumb
                key={p.id}
                photo={p}
                selected={selected.has(p.id)}
                tags={photoTags[p.id]}
                onToggle={(e) => onTogglePhoto(p.id, e)}
              />
            ))}
          </div>
        </div>
      ))}
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

export { AdminSelectableThumb };
