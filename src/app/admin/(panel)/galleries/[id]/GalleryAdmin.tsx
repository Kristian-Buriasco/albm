'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Gallery, Photo } from '@/db/schema';
import { HeartIcon } from '@/components/Lightbox';
import ToggleSwitch from '@/components/ToggleSwitch';
import SegmentedControl from '@/components/SegmentedControl';
import {
  AdminCommentsPanel,
  AdminExtraSettings,
  AdminSectionsPanel,
} from './AdminGalleryFeatures';
import ShareTools from '@/components/ShareTools';
import MostViewedStrip from '@/components/MostViewedStrip';

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
  likeCounts: Record<string, number>;
  viewStats: { total: number; last7: number; lastAt: number | null };
  sizeBytes: number;
  shareUrl: string;
  topViewed?: { photoId: string; count: number }[];
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
  likeCounts,
  viewStats,
  sizeBytes,
  shareUrl,
  topViewed = [],
}: Props) {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const isClientGallery = gallery.type === 'client';

  // Anchor for shift-click range selection: the id of the last photo toggled
  // by a plain (non-shift) click. Shift-clicking another photo selects every
  // photo between the anchor and the target, inclusive (in display order).
  const selectAnchor = useRef<string | null>(null);

  function togglePhotoSelection(photoId: string, e: React.MouseEvent) {
    if (e.shiftKey && selectAnchor.current && selectAnchor.current !== photoId) {
      const from = photos.findIndex((p) => p.id === selectAnchor.current);
      const to = photos.findIndex((p) => p.id === photoId);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        setSelected((prev) => {
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) next.add(photos[i].id);
          return next;
        });
        selectAnchor.current = photoId;
        return;
      }
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
    selectAnchor.current = photoId;
  }

  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelected(new Set());
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        if (gridRef.current?.contains(document.activeElement) || document.activeElement === document.body) {
          e.preventDefault();
          setSelected(new Set(photos.map((p) => p.id)));
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos]);

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
    failures: { file: File; reason: string }[];
    duplicates: { file: string; existing: string }[];
  }>({ total: 0, done: 0, currentName: null, currentPct: 0, failures: [], duplicates: [] });
  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  const uploadManifestKey = `albm-upload-${gallery.id}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(uploadManifestKey);
      if (!raw) return;
      const manifest = JSON.parse(raw) as { filenames: string[] };
      const present = new Set(photos.map((p) => p.filename));
      const missing = manifest.filenames.filter((f) => !present.has(f));
      if (missing.length > 0) setMissingFiles(missing);
    } catch {
      /* ignore */
    }
  }, [photos, uploadManifestKey]);
  const uploading = uploadState.total > 0 && uploadState.done < uploadState.total;

  useEffect(() => {
    if (!uploading) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [uploading]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [folderSectionsEnabled, setFolderSectionsEnabled] = useState(true);

  function uploadOne(file: File, sectionId?: string | null): Promise<Photo> {
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
        if (xhr.status === 201) {
          resolve(JSON.parse(xhr.responseText));
        } else if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          if (data.duplicate) {
            reject(new Error(`duplicate:${data.existingFilename}`));
          } else {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('network error'));
      const form = new FormData();
      form.append('file', file);
      if (sectionId) form.append('sectionId', sectionId);
      xhr.send(form);
    });
  }

  const startUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const unsupported = files.filter(
        (f) => f.type !== 'image/jpeg' && f.type !== 'image/png',
      );
      const accepted = files.filter(
        (f) => f.type === 'image/jpeg' || f.type === 'image/png',
      );
      setUploadState({
        total: files.length,
        done: unsupported.length,
        currentName: null,
        currentPct: 0,
        failures: unsupported.map((file) => ({
          file,
          reason: 'unsupported type',
        })),
        duplicates: [],
      });
      try {
        localStorage.setItem(
          uploadManifestKey,
          JSON.stringify({
            filenames: accepted.map((f) => f.name),
            at: Date.now(),
          }),
        );
      } catch {
        /* ignore */
      }
      for (const file of accepted) {
        setUploadState((s) => ({ ...s, currentName: file.name, currentPct: 0 }));
        let ok = false;
        // 1 initial attempt + up to 3 retries with exponential backoff.
        for (let attempt = 0; attempt < 4 && !ok; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          }
          try {
            const photo = await uploadOne(file);
            setPhotos((prev) => [...prev, photo]);
            ok = true;
          } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            if (msg.startsWith('duplicate:')) {
              setUploadState((s) => ({
                ...s,
                duplicates: [
                  ...s.duplicates,
                  { file: file.name, existing: msg.slice('duplicate:'.length) },
                ],
              }));
              ok = true;
            }
          }
        }
        setUploadState((s) => ({
          ...s,
          done: s.done + 1,
          failures: ok
            ? s.failures
            : [...s.failures, { file, reason: 'upload failed' }],
        }));
      }
      try {
        localStorage.removeItem(uploadManifestKey);
      } catch {
        /* ignore */
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gallery.id],
  );

  const startFolderUpload = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter(
        (f) => f.type === 'image/jpeg' || f.type === 'image/png',
      );
      const sectionMap = new Map<string, string>();
      if (folderSectionsEnabled) {
        const topFolders = new Set<string>();
        for (const f of imageFiles) {
          const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
          const parts = rel.split('/').filter(Boolean);
          if (parts.length >= 2) topFolders.add(parts[0]);
        }
        const existingRes = await fetch(`/api/admin/galleries/${gallery.id}/sections`);
        const existing: { id: string; title: string }[] = existingRes.ok
          ? await existingRes.json()
          : [];
        for (const folder of topFolders) {
          const match = existing.find((s) => s.title === folder);
          if (match) {
            sectionMap.set(folder, match.id);
            continue;
          }
          const res = await fetch(`/api/admin/galleries/${gallery.id}/sections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: folder }),
          });
          if (res.ok) {
            const sec = await res.json();
            sectionMap.set(folder, sec.id);
          }
        }
      }
      for (const file of imageFiles) {
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
        const parts = rel.split('/').filter(Boolean);
        const sectionId =
          folderSectionsEnabled && parts.length >= 2
            ? sectionMap.get(parts[0]) ?? null
            : null;
        try {
          const photo = await uploadOne(file, sectionId);
          setPhotos((prev) => [...prev, photo]);
        } catch {
          /* individual failures ignored in folder mode */
        }
      }
    },
    [gallery.id, folderSectionsEnabled],
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

  async function patchAlt(photoId: string, altText: string) {
    const res = await fetch(`/api/admin/photos/${photoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ altText }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPhotos((prev) => prev.map((p) => (p.id === photoId ? updated : p)));
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

  // ---- likes (portfolio) ----
  const [sortByLikes, setSortByLikes] = useState(false);
  const totalLikes = useMemo(
    () => Object.values(likeCounts).reduce((a, b) => a + b, 0),
    [likeCounts],
  );

  let gridPhotos = selectedOnly
    ? photos.filter((p) => selectionsByPhoto.has(p.id))
    : photos;
  if (sortByLikes) {
    gridPhotos = [...gridPhotos].sort(
      (a, b) => (likeCounts[b.id] ?? 0) - (likeCounts[a.id] ?? 0),
    );
  }

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
            {!isClientGallery && totalLikes > 0 && ` · ${totalLikes} likes`}
            {saving && ' · saving…'}
            {savedFlash && !saving && ' · saved'}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {viewStats.total} view{viewStats.total === 1 ? '' : 's'} ·{' '}
            {viewStats.last7} in last 7 days
            {viewStats.lastAt
              ? ` · last viewed ${new Date(viewStats.lastAt).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : ' · never viewed'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-xs">
          <code className="max-w-[16rem] truncate rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-900">
            {shareUrl}
          </code>
          {isClientGallery ? (
            <>
              <ShareTools url={shareUrl} />
              {gallery.eventPage && (
                <div className="mt-2 w-full border-t border-neutral-200 pt-2 dark:border-neutral-800">
                  <p className="mb-1 text-[10px] tracking-wide text-neutral-500 uppercase">
                    Event page QR
                  </p>
                  <code className="mb-1 block max-w-[16rem] truncate rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-900">
                    {`${shareUrl}/event`}
                  </code>
                  <ShareTools url={`${shareUrl}/event`} />
                </div>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(shareUrl)}
              className="border border-neutral-300 px-3 py-1 transition-colors hover:border-neutral-900 dark:border-neutral-700 dark:hover:border-neutral-100"
            >
              Copy link
            </button>
          )}
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
              <PinField
                pinEnabled={gallery.pinEnabled}
                hasPin={!!gallery.pinHash}
                onToggle={(enabled) => patchGallery({ pinEnabled: enabled })}
                onSave={(pin) => patchGallery({ pin })}
              />
              <SegmentedControl
                label="Client info"
                value={gallery.clientInfoMode}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'optional', label: 'Optional' },
                  { value: 'required', label: 'Required' },
                ]}
                onChange={(v) => patchGallery({ clientInfoMode: v })}
              />
            </>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
            Toggles
          </h2>
          <ToggleSwitch
            label="Published"
            hint={
              isClientGallery
                ? 'Unpublished galleries return 404 for visitors'
                : 'Unpublished portfolio galleries are hidden from the public site'
            }
            checked={gallery.published}
            onChange={(v) => patchGallery({ published: v })}
          />
          <ToggleSwitch
            label="Watermark web images"
            hint="Toggling re-generates all web derivatives"
            checked={gallery.watermarkEnabled}
            onChange={(v) => patchGallery({ watermarkEnabled: v })}
          />
          {isClientGallery && (
            <>
              <ToggleSwitch
                label="Allow downloads"
                hint="Master switch for single + ZIP downloads"
                checked={gallery.downloadEnabled}
                onChange={(v) => patchGallery({ downloadEnabled: v })}
              />
              <ToggleSwitch
                label="Selection export tools"
                hint="Show filename export in this page"
                checked={gallery.selectionExportEnabled}
                onChange={(v) => patchGallery({ selectionExportEnabled: v })}
              />
            </>
          )}
          {!isClientGallery && (
            <>
              <ToggleSwitch
                label="Show public like counts"
                hint="Visitors see aggregate counts next to hearts"
                checked={gallery.showLikeCounts}
                onChange={(v) => patchGallery({ showLikeCounts: v })}
              />
              <ToggleSwitch
                label="Show in Featured Work"
                hint="Featured on the homepage Featured Work grid"
                checked={gallery.featured}
                onChange={(v) => patchGallery({ featured: v })}
              />
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
                  Homepage sort order
                </span>
                <input
                  type="number"
                  defaultValue={gallery.sortOrder}
                  onBlur={(e) =>
                    patchGallery({ sortOrder: parseInt(e.target.value, 10) || 0 })
                  }
                  className={inputClass}
                />
              </label>
            </>
          )}
        </div>
      </section>

      <AdminExtraSettings gallery={gallery} photos={photos} patchGallery={patchGallery} />
      <AdminSectionsPanel
        galleryId={gallery.id}
        photos={photos}
        selected={selected}
        onSelectedChange={setSelected}
        onPhotosChange={setPhotos}
        onTogglePhoto={togglePhotoSelection}
      />
      <AdminCommentsPanel galleryId={gallery.id} />

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
            const files = [...e.dataTransfer.files];
            const hasSubfolders = files.some((f) => {
              const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
              return rel.split('/').filter(Boolean).length >= 2;
            });
            if (hasSubfolders) startFolderUpload(files);
            else startUpload(files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer border border-dashed px-6 py-10 text-center text-sm transition-colors ${
            dragOver
              ? 'border-neutral-900 bg-neutral-100 dark:border-neutral-100 dark:bg-neutral-900'
              : 'border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400'
          }`}
        >
          Drop JPEG/PNG files here, or click to choose
          <p className="mt-2">
            <ToggleSwitch
              label="Map subfolders to sections"
              checked={folderSectionsEnabled}
              onChange={setFolderSectionsEnabled}
            />
          </p>
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
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is non-standard but widely supported
            webkitdirectory=""
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) startFolderUpload([...e.target.files]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              folderInputRef.current?.click();
            }}
            className="mt-3 text-xs underline"
          >
            Upload folder
          </button>
        </div>
        {missingFiles.length > 0 && (
          <div className="mt-3 rounded border border-amber-500/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-medium">These files didn&apos;t make it from your last upload:</p>
            <ul className="mt-1 list-inside list-disc">
              {missingFiles.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-2 underline"
              onClick={() => {
                setMissingFiles([]);
                localStorage.removeItem(uploadManifestKey);
              }}
            >
              Dismiss
            </button>
          </div>
        )}
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
            {!uploading && uploadState.duplicates.length > 0 && (
              <p className="text-amber-700 dark:text-amber-300">
                Skipped duplicates:{' '}
                {uploadState.duplicates
                  .map((d) => `${d.file} (duplicate of ${d.existing})`)
                  .join(', ')}
              </p>
            )}
            {!uploading && uploadState.failures.length > 0 && (
              <div className="text-red-600 dark:text-red-400">
                Failed:{' '}
                {uploadState.failures
                  .map((f) => `${f.file.name} (${f.reason})`)
                  .join(', ')}{' '}
                {uploadState.failures.some((f) => f.reason !== 'unsupported type') && (
                  <button
                    type="button"
                    onClick={() =>
                      startUpload(
                        uploadState.failures
                          .filter((f) => f.reason !== 'unsupported type')
                          .map((f) => f.file),
                      )
                    }
                    className="underline underline-offset-2"
                  >
                    Retry failed
                  </button>
                )}
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
      <section ref={gridRef} tabIndex={-1} className="outline-none">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
            Photos
          </h2>
          <div className="flex items-center gap-4">
            {!isClientGallery && totalLikes > 0 && (
              <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={sortByLikes}
                  onChange={(e) => setSortByLikes(e.target.checked)}
                />
                Sort by likes
              </label>
            )}
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
        </div>
        {gridPhotos.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {selectedOnly ? 'No selected photos.' : 'No photos yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {gridPhotos.map((p, i) => {
              const selCount = selectionsByPhoto.get(p.id)?.length ?? 0;
              const likeCount = likeCounts[p.id] ?? 0;
              const isSelected = selected.has(p.id);
              return (
                <div
                  key={p.id}
                  draggable={!selectedOnly && !sortByLikes && !isSelected}
                  onDragStart={() => (dragIndex.current = i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (selectedOnly || sortByLikes || dragIndex.current === null)
                      return;
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
                  className={`group relative aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-900 ${
                    isSelected ? 'ring-2 ring-accent dark:ring-accent-dark' : ''
                  }`}
                >
                  {p.status === 'ready' ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/img/${p.id}/thumb?v=${p.updatedAt}`}
                      alt={p.filename}
                      loading="lazy"
                      className={`h-full w-full object-cover ${isSelected ? 'opacity-75' : ''}`}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-400">
                      {p.status === 'processing' ? 'processing…' : 'error'}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => togglePhotoSelection(p.id, e)}
                    className="absolute top-1 left-1 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                    aria-label={isSelected ? 'Deselect photo' : 'Select photo'}
                  >
                    {isSelected ? '✓' : ''}
                  </button>
                  {isSelected && (
                    <span className="pointer-events-none absolute inset-0 bg-accent/10 dark:bg-accent-dark/10" />
                  )}
                  {gallery.coverPhotoId === p.id && (
                    <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white">
                      COVER
                    </span>
                  )}
                  {(isClientGallery ? selCount : likeCount) > 0 && (
                    <span className="absolute top-1 right-1 flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white">
                      <HeartIcon filled className="h-2.5 w-2.5" />
                      {isClientGallery ? selCount : likeCount}
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        const alt = prompt('Alt text (max 300 chars)', p.altText ?? '');
                        if (alt !== null) void patchAlt(p.id, alt);
                      }}
                      className="text-[10px] text-white hover:underline"
                    >
                      Alt
                    </button>
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
                        navigator.clipboard.writeText(exportFilenames.join(','))
                      }
                      className="border border-neutral-300 px-3 py-1 transition-colors hover:border-neutral-900 dark:border-neutral-700 dark:hover:border-neutral-100"
                    >
                      Copy filenames
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(exportFilenames.join('\n'))
                      }
                      className="border border-neutral-300 px-3 py-1 transition-colors hover:border-neutral-900 dark:border-neutral-700 dark:hover:border-neutral-100"
                    >
                      Copy list
                    </button>
                    <a
                      href={`/api/admin/galleries/${gallery.id}/selections.csv`}
                      className="border border-neutral-300 px-3 py-1 transition-colors hover:border-neutral-900 dark:border-neutral-700 dark:hover:border-neutral-100"
                    >
                      Export selections (CSV)
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

      {/* most viewed */}
      {topViewed.length > 0 && <MostViewedStrip items={topViewed} photos={photos} />}

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

function PinField({
  pinEnabled,
  hasPin,
  onToggle,
  onSave,
}: {
  pinEnabled: boolean;
  hasPin: boolean;
  onToggle: (enabled: boolean) => void;
  onSave: (pin: string | null) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="space-y-2 text-sm">
      <ToggleSwitch
        label="PIN access (optional)"
        hint="Convenient, less secure than a password."
        checked={pinEnabled}
        onChange={onToggle}
      />
      {pinEnabled && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={hasPin ? 'New PIN (6 digits)' : 'Set PIN (6 digits)'}
            className="flex-1 border-b border-neutral-300 bg-transparent py-1.5 text-sm outline-none dark:border-neutral-700"
          />
          <button
            type="button"
            disabled={value.length < 6}
            onClick={() => {
              onSave(value);
              setValue('');
            }}
            className="border border-neutral-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-neutral-700"
          >
            Set PIN
          </button>
          {hasPin && (
            <button
              type="button"
              onClick={() => onSave(null)}
              className="text-xs text-neutral-500 underline"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
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
