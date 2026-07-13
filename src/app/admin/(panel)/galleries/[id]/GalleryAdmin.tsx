'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Gallery, Photo } from '@/db/schema';
import { HeartIcon } from '@/components/Lightbox';

interface VisitorInfo {
  id: string;
  name: string | null;
  email: string | null;
}
interface SelectionRow {
  photoId: string;
  visitorId: string;
}

interface Props {
  gallery: Gallery;
  initialPhotos: Photo[];
  visitors: VisitorInfo[];
  selections: SelectionRow[];
  sizeBytes: number;
  shareUrl: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function visitorLabel(v: VisitorInfo, anonIndex: number): string {
  if (v.name || v.email) return [v.name, v.email].filter(Boolean).join(' · ');
  return `Anonymous #${anonIndex}`;
}

export default function GalleryAdmin({
  gallery,
  initialPhotos,
  visitors,
  selections,
  sizeBytes,
  shareUrl,
}: Props) {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const isClientGallery = gallery.type === 'client';

  // ---- status polling while anything is processing ----
  const anyProcessing = photos.some((p) => p.status === 'processing');
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/admin/galleries/${gallery.id}/photos`);
      if (res.ok) setPhotos(await res.json());
    }, 3000);
    return () => clearInterval(t);
  }, [anyProcessing, gallery.id]);

  const processingCount = photos.filter((p) => p.status === 'processing').length;

  // ---- settings ----
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  async function patchGallery(body: Record<string, unknown>) {
    setSaving(true);
    const res = await fetch(`/api/admin/galleries/${gallery.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      router.refresh();
      if ('watermarkEnabled' in body) {
        // Reprocessing was kicked off server-side; refresh photo statuses.
        const r = await fetch(`/api/admin/galleries/${gallery.id}/photos`);
        if (r.ok) setPhotos(await r.json());
      }
    }
    return res.ok;
  }

  // ---- upload ----
  const [uploadState, setUploadState] = useState<{
    total: number;
    done: number;
    currentName: string | null;
    currentPct: number;
    failures: File[];
  }>({ total: 0, done: 0, currentName: null, currentPct: 0, failures: [] });
  const uploading = uploadState.total > 0 && uploadState.done < uploadState.total;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function uploadOne(file: File): Promise<Photo> {
    // XHR gives per-file upload progress; fetch does not.
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/admin/galleries/${gallery.id}/photos`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadState((s) => ({
            ...s,
            currentPct: Math.round((e.loaded / e.total) * 100),
          }));
        }
      };
      xhr.onload = () => {
        if (xhr.status === 201) resolve(JSON.parse(xhr.responseText));
        else reject(new Error(`HTTP ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('network error'));
      const form = new FormData();
      form.append('file', file);
      xhr.send(form);
    });
  }

  const startUpload = useCallback(
    async (files: File[]) => {
      const accepted = files.filter(
        (f) => f.type === 'image/jpeg' || f.type === 'image/png',
      );
      if (accepted.length === 0) return;
      setUploadState({
        total: accepted.length,
        done: 0,
        currentName: null,
        currentPct: 0,
        failures: [],
      });
      for (const file of accepted) {
        setUploadState((s) => ({ ...s, currentName: file.name, currentPct: 0 }));
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          }
          try {
            const photo = await uploadOne(file);
            setPhotos((prev) => [...prev, photo]);
            ok = true;
          } catch {
            /* retry */
          }
        }
        setUploadState((s) => ({
          ...s,
          done: s.done + 1,
          failures: ok ? s.failures : [...s.failures, file],
        }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gallery.id],
  );

  // ---- reorder (HTML5 drag & drop) ----
  const dragIndex = useRef<number | null>(null);
  async function persistOrder(list: Photo[]) {
    await fetch(`/api/admin/galleries/${gallery.id}/photos/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(list.map((p) => p.id)),
    });
  }

  // ---- delete photo / set cover ----
  async function deletePhoto(photo: Photo) {
    if (!confirm(`Delete ${photo.filename}? This removes the files on disk.`)) return;
    const res = await fetch(`/api/admin/photos/${photo.id}`, { method: 'DELETE' });
    if (res.ok) {
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      router.refresh();
    }
  }

  async function setCover(photoId: string) {
    await patchGallery({ coverPhotoId: photoId });
  }

  // ---- delete gallery ----
  async function deleteGallery() {
    if (
      !confirm(
        `Delete "${gallery.title}"?\n\nThis permanently removes ${photos.length} photo(s) (${formatBytes(sizeBytes)}) from disk. This cannot be undone.`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/galleries/${gallery.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      router.push('/admin');
      router.refresh();
    }
  }

  // ---- selections ----
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [exportVisitor, setExportVisitor] = useState<string>('all');
  const selectionsByPhoto = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of selections) {
      m.set(s.photoId, [...(m.get(s.photoId) ?? []), s.visitorId]);
    }
    return m;
  }, [selections]);

  const anonIndices = useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const v of visitors) {
      if (!v.name && !v.email) m.set(v.id, ++n);
    }
    return m;
  }, [visitors]);

  const visitorsWithSelections = useMemo(
    () =>
      visitors
        .map((v) => ({
          visitor: v,
          count: selections.filter((s) => s.visitorId === v.id).length,
        }))
        .filter((x) => x.count > 0),
    [visitors, selections],
  );

  const exportFilenames = useMemo(() => {
    const ids = new Set(
      selections
        .filter((s) => exportVisitor === 'all' || s.visitorId === exportVisitor)
        .map((s) => s.photoId),
    );
    return photos.filter((p) => ids.has(p.id)).map((p) => p.filename);
  }, [selections, exportVisitor, photos]);

  const gridPhotos = selectedOnly
    ? photos.filter((p) => selectionsByPhoto.has(p.id))
    : photos;

  const inputClass =
    'w-full border-b border-neutral-300 bg-transparent py-1.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100';

  return (
    <div className="space-y-12">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-medium">{gallery.title}</h1>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {isClientGallery ? 'Client gallery' : 'Portfolio gallery'} ·{' '}
            {photos.length} photos · {formatBytes(sizeBytes)}
            {saving && ' · saving…'}
            {savedFlash && !saving && ' · saved'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <code className="max-w-[16rem] truncate rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-900">
            {shareUrl}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(shareUrl)}
            className="border border-neutral-300 px-3 py-1 transition-colors hover:border-neutral-900 dark:border-neutral-700 dark:hover:border-neutral-100"
          >
            Copy link
          </button>
        </div>
      </div>

      {/* settings */}
      <section className="grid gap-8 md:grid-cols-2">
        <div className="space-y-5">
          <h2 className="text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
            Settings
          </h2>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
              Title
            </span>
            <input
              type="text"
              defaultValue={gallery.title}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== gallery.title) {
                  patchGallery({ title: e.target.value.trim() });
                }
              }}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
              Event date
            </span>
            <input
              type="date"
              defaultValue={
                gallery.eventDate
                  ? new Date(gallery.eventDate).toISOString().slice(0, 10)
                  : ''
              }
              onChange={(e) =>
                patchGallery({
                  eventDate: e.target.value
                    ? new Date(e.target.value + 'T00:00:00Z').getTime()
                    : null,
                })
              }
              className={inputClass}
            />
          </label>
          {isClientGallery && (
            <>
              <PasswordField
                hasPassword={!!gallery.passwordHash}
                onSave={(pw) => patchGallery({ password: pw })}
              />
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
                  Client info
                </span>
                <select
                  defaultValue={gallery.clientInfoMode}
                  onChange={(e) => patchGallery({ clientInfoMode: e.target.value })}
                  className={inputClass}
                >
                  <option value="off">Off — never ask</option>
                  <option value="optional">Optional — ask, allow skip</option>
                  <option value="required">Required — must give name + email</option>
                </select>
              </label>
            </>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
            Toggles
          </h2>
          <Toggle
            label="Published"
            hint={
              isClientGallery
                ? 'Unpublished galleries return 404 for visitors'
                : 'Unpublished portfolio galleries are hidden from the public site'
            }
            checked={gallery.published}
            onChange={(v) => patchGallery({ published: v })}
          />
          <Toggle
            label="Watermark web images"
            hint="Toggling re-generates all web derivatives"
            checked={gallery.watermarkEnabled}
            onChange={(v) => patchGallery({ watermarkEnabled: v })}
          />
          {isClientGallery && (
            <>
              <Toggle
                label="Allow downloads"
                hint="Master switch for single + ZIP downloads"
                checked={gallery.downloadEnabled}
                onChange={(v) => patchGallery({ downloadEnabled: v })}
              />
              <Toggle
                label="Selection export tools"
                hint="Show filename export in this page"
                checked={gallery.selectionExportEnabled}
                onChange={(v) => patchGallery({ selectionExportEnabled: v })}
              />
            </>
          )}
        </div>
      </section>

      {/* upload */}
      <section>
        <h2 className="mb-3 text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
          Upload
        </h2>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            startUpload([...e.dataTransfer.files]);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer border border-dashed px-6 py-10 text-center text-sm transition-colors ${
            dragOver
              ? 'border-neutral-900 bg-neutral-100 dark:border-neutral-100 dark:bg-neutral-900'
              : 'border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400'
          }`}
        >
          Drop JPEG/PNG files here, or click to choose
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) startUpload([...e.target.files]);
              e.target.value = '';
            }}
          />
        </div>
        {uploadState.total > 0 && (
          <div className="mt-3 space-y-2 text-xs text-neutral-600 dark:text-neutral-300">
            <p>
              {uploading
                ? `Uploading ${uploadState.done + 1} of ${uploadState.total}: ${uploadState.currentName ?? ''} (${uploadState.currentPct}%)`
                : `Uploaded ${uploadState.total - uploadState.failures.length} of ${uploadState.total} files.`}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className="h-full bg-neutral-900 transition-all dark:bg-neutral-100"
                style={{
                  width: `${Math.round(((uploadState.done + uploadState.currentPct / 100) / uploadState.total) * 100)}%`,
                }}
              />
            </div>
            {!uploading && uploadState.failures.length > 0 && (
              <div className="text-red-600 dark:text-red-400">
                Failed: {uploadState.failures.map((f) => f.name).join(', ')}{' '}
                <button
                  type="button"
                  onClick={() => startUpload(uploadState.failures)}
                  className="underline underline-offset-2"
                >
                  Retry failed
                </button>
              </div>
            )}
          </div>
        )}
        {processingCount > 0 && (
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Processing {processingCount} photo{processingCount > 1 ? 's' : ''}…
          </p>
        )}
      </section>

      {/* photo grid */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
            Photos
          </h2>
          {isClientGallery && selections.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={selectedOnly}
                onChange={(e) => setSelectedOnly(e.target.checked)}
              />
              Selected only
            </label>
          )}
        </div>
        {gridPhotos.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {selectedOnly ? 'No selected photos.' : 'No photos yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {gridPhotos.map((p, i) => {
              const selCount = selectionsByPhoto.get(p.id)?.length ?? 0;
              return (
                <div
                  key={p.id}
                  draggable={!selectedOnly}
                  onDragStart={() => (dragIndex.current = i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (selectedOnly || dragIndex.current === null) return;
                    const from = dragIndex.current;
                    dragIndex.current = null;
                    if (from === i) return;
                    setPhotos((prev) => {
                      const next = [...prev];
                      const [moved] = next.splice(from, 1);
                      next.splice(i, 0, moved);
                      void persistOrder(next);
                      return next;
                    });
                  }}
                  className="group relative aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-900"
                >
                  {p.status === 'ready' ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/img/${p.id}/thumb?v=${p.updatedAt}`}
                      alt={p.filename}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-400">
                      {p.status === 'processing' ? 'processing…' : 'error'}
                    </div>
                  )}
                  {gallery.coverPhotoId === p.id && (
                    <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white">
                      COVER
                    </span>
                  )}
                  {selCount > 0 && (
                    <span className="absolute top-1 right-1 flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white">
                      <HeartIcon filled className="h-2.5 w-2.5" />
                      {selCount}
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setCover(p.id)}
                      className="text-[10px] text-white hover:underline"
                    >
                      Cover
                    </button>
                    <span
                      className="truncate text-[9px] text-neutral-300"
                      title={p.filename}
                    >
                      {p.filename}
                    </span>
                    <button
                      type="button"
                      onClick={() => deletePhoto(p)}
                      className="text-[10px] text-red-300 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* selections panel */}
      {isClientGallery && (
        <section>
          <h2 className="mb-3 text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
            Selections
          </h2>
          {selections.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No selections yet.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm">
                {selections.length} selection{selections.length > 1 ? 's' : ''} ·{' '}
                {new Set(selections.map((s) => s.photoId)).size} unique photos
              </p>
              <ul className="space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
                {visitorsWithSelections.map(({ visitor, count }) => (
                  <li key={visitor.id}>
                    {visitorLabel(visitor, anonIndices.get(visitor.id) ?? 0)} —{' '}
                    {count} photo{count > 1 ? 's' : ''}
                  </li>
                ))}
              </ul>
              {gallery.selectionExportEnabled && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-neutral-500 dark:text-neutral-400">
                      Filename export
                    </span>
                    <select
                      value={exportVisitor}
                      onChange={(e) => setExportVisitor(e.target.value)}
                      className="border-b border-neutral-300 bg-transparent py-1 outline-none dark:border-neutral-700"
                    >
                      <option value="all">All visitors</option>
                      {visitorsWithSelections.map(({ visitor }) => (
                        <option key={visitor.id} value={visitor.id}>
                          {visitorLabel(visitor, anonIndices.get(visitor.id) ?? 0)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(exportFilenames.join('\n'))
                      }
                      className="border border-neutral-300 px-3 py-1 transition-colors hover:border-neutral-900 dark:border-neutral-700 dark:hover:border-neutral-100"
                    >
                      Copy
                    </button>
                    <a
                      href={`/api/admin/galleries/${gallery.id}/selections.csv`}
                      className="underline underline-offset-4"
                    >
                      Download CSV
                    </a>
                  </div>
                  <textarea
                    readOnly
                    value={exportFilenames.join('\n')}
                    rows={Math.min(10, Math.max(3, exportFilenames.length))}
                    className="w-full border border-neutral-300 bg-transparent p-2 font-mono text-xs dark:border-neutral-700"
                  />
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* danger zone */}
      <section className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <button
          type="button"
          onClick={deleteGallery}
          className="border border-red-600 px-4 py-1.5 text-xs tracking-widest text-red-600 uppercase transition-colors hover:bg-red-600 hover:text-white"
        >
          Delete gallery
        </button>
      </section>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const [value, setValue] = useState(checked);
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm">{label}</span>
        {hint && (
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
            {hint}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => {
          setValue(e.target.checked);
          onChange(e.target.checked);
        }}
        className="mt-1 h-4 w-4 accent-neutral-900 dark:accent-neutral-100"
      />
    </label>
  );
}

function PasswordField({
  hasPassword,
  onSave,
}: {
  hasPassword: boolean;
  onSave: (pw: string | null) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="text-sm">
      <span className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
        Password {hasPassword ? '(set)' : '(none)'}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="New password"
          className="flex-1 border-b border-neutral-300 bg-transparent py-1.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
        />
        <button
          type="button"
          disabled={!value}
          onClick={() => {
            onSave(value);
            setValue('');
          }}
          className="border border-neutral-300 px-2 py-1 text-xs transition-colors hover:border-neutral-900 disabled:opacity-40 dark:border-neutral-700 dark:hover:border-neutral-100"
        >
          Set
        </button>
        {hasPassword && (
          <button
            type="button"
            onClick={() => onSave(null)}
            className="px-2 py-1 text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
