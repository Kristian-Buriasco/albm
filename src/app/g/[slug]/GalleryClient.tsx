'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import SectionedGalleryGrid, {
  HeartIcon,
  Lightbox,
  PhotoComments,
  type SectionGroup,
} from '@/components/SectionedGalleryGrid';
import ThemeToggle from '@/components/ThemeToggle';
import type { LightboxPhoto } from '@/components/Lightbox';

interface Props {
  slug: string;
  title: string;
  eventDate: number | null;
  clientInfoMode: 'off' | 'optional' | 'required';
  downloadEnabled: boolean;
  favoritesDownloadEnabled: boolean;
  sections: SectionGroup[];
  hasVisitor: boolean;
  initialSelectedIds: string[];
  commentsEnabled: boolean;
  showExif: boolean;
  showLocation: boolean;
  locationName: string | null;
  locationLat: string | null;
  locationLng: string | null;
  selectionLimit: number | null;
}

export default function GalleryClient({
  slug,
  title,
  eventDate,
  clientInfoMode,
  downloadEnabled,
  favoritesDownloadEnabled,
  sections,
  hasVisitor,
  initialSelectedIds,
  commentsEnabled,
  showLocation,
  locationName,
  locationLat,
  locationLng,
  selectionLimit,
}: Props) {
  const photos = useMemo(() => sections.flatMap((s) => s.photos), [sections]);
  const [visitorReady, setVisitorReady] = useState(hasVisitor);
  const [showInfoModal, setShowInfoModal] = useState(
    !hasVisitor && clientInfoMode !== 'off',
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelectedIds),
  );
  const [onlyMine, setOnlyMine] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!commentsEnabled) return;
    fetch(`/api/g/${slug}/comments?photoId=_`)
      .catch(() => null);
    // Counts loaded per-photo in lightbox; badge counts from initial server could be added later.
  }, [slug, commentsEnabled]);

  const ensureVisitor = useCallback(async (): Promise<boolean> => {
    if (visitorReady) return true;
    const res = await fetch(`/api/g/${slug}/visitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      setVisitorReady(true);
      return true;
    }
    return false;
  }, [slug, visitorReady]);

  const atLimit = selectionLimit !== null && selected.size >= selectionLimit;

  const toggleSelect = useCallback(
    async (photoId: string) => {
      const isSelected = selected.has(photoId);
      if (!isSelected && atLimit) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (isSelected) next.delete(photoId);
        else next.add(photoId);
        return next;
      });
      if (!(await ensureVisitor())) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (isSelected) next.add(photoId);
          else next.delete(photoId);
          return next;
        });
        return;
      }
      const res = await fetch(`/api/g/${slug}/selections`, {
        method: isSelected ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId }),
      });
      if (!res.ok) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (isSelected) next.add(photoId);
          else next.delete(photoId);
          return next;
        });
      }
    },
    [selected, slug, ensureVisitor, atLimit],
  );

  const filteredSections = useMemo(() => {
    if (!onlyMine) return sections;
    return sections
      .map((s) => ({
        ...s,
        photos: s.photos.filter((p) => selected.has(p.id)),
      }))
      .filter((s) => s.photos.length > 0);
  }, [sections, onlyMine, selected]);

  const visible = useMemo(
    () => filteredSections.flatMap((s) => s.photos),
    [filteredSections],
  );

  const gateContent = clientInfoMode === 'required' && showInfoModal;
  const mapUrl =
    showLocation && locationLat && locationLng
      ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(locationLat)}&mlon=${encodeURIComponent(locationLng)}#map=14/${encodeURIComponent(locationLat)}/${encodeURIComponent(locationLng)}`
      : null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-paper/90 backdrop-blur dark:border-line-dark/70 dark:bg-paper-dark/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">
              {title}
            </h1>
            <p className="mt-0.5 text-[11px] text-muted dark:text-muted-dark">
              {eventDate
                ? new Date(eventDate).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }) + ' · '
                : ''}
              {photos.length} photos
              {selected.size > 0 ? ` · ${selected.size} selected` : ''}
              {selectionLimit !== null
                ? ` · ${selected.size} of ${selectionLimit} selected`
                : ''}
            </p>
            {showLocation && locationName && (
              <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                {locationName}
                {mapUrl && (
                  <>
                    {' · '}
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      View on map
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setOnlyMine((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors ${
                onlyMine
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-black'
                  : 'border-neutral-300 text-neutral-600 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300'
              }`}
            >
              <HeartIcon filled={onlyMine} className="h-3.5 w-3.5" />
              My selections
            </button>
            {downloadEnabled && (
              <a
                href={`/dl/gallery/${slug}.zip`}
                className="rounded-full border border-neutral-300 px-3 py-1.5 text-neutral-600 transition-colors hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300"
              >
                Download all
              </a>
            )}
            {downloadEnabled && favoritesDownloadEnabled && selected.size > 0 && (
              <a
                href={`/dl/favorites/${slug}.zip`}
                className="rounded-full border border-neutral-300 px-3 py-1.5 text-neutral-600 transition-colors hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300"
              >
                Download my selections
              </a>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {!gateContent && (
        <main className="mx-auto max-w-7xl px-2 py-4 sm:px-4">
          <SectionedGalleryGrid
            sections={filteredSections}
            commentsEnabled={commentsEnabled}
            commentCounts={commentCounts}
            onOpenLightbox={setLightbox}
            renderTileOverlay={(p: LightboxPhoto) => (
              <button
                type="button"
                onClick={() => toggleSelect(p.id)}
                disabled={!selected.has(p.id) && atLimit}
                aria-label={
                  selected.has(p.id) ? 'Remove from selection' : 'Add to selection'
                }
                className={`absolute right-2 bottom-2 rounded-full p-1.5 transition-opacity ${
                  selected.has(p.id)
                    ? 'text-white opacity-100 drop-shadow'
                    : 'text-white/90 opacity-0 drop-shadow group-hover:opacity-100 max-sm:opacity-70'
                } disabled:opacity-30`}
              >
                <HeartIcon filled={selected.has(p.id)} className="h-5 w-5" />
              </button>
            )}
          />
        </main>
      )}

      {lightbox !== null && visible.length > 0 && (
        <>
          <Lightbox
            photos={visible}
            index={Math.min(lightbox, visible.length - 1)}
            onClose={() => setLightbox(null)}
            onNavigate={setLightbox}
            showFilename
            selectedIds={selected}
            onToggleSelect={toggleSelect}
            downloadEnabled={downloadEnabled}
            commentsEnabled={commentsEnabled}
            commentsApiBase={`/api/g/${slug}/comments`}
          />
        </>
      )}

      {showInfoModal && (
        <InfoGateModal
          slug={slug}
          required={clientInfoMode === 'required'}
          onDone={() => {
            setShowInfoModal(false);
            setVisitorReady(true);
          }}
        />
      )}
    </div>
  );
}

function InfoGateModal({
  slug,
  required,
  onDone,
}: {
  slug: string;
  required: boolean;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createVisitor(body: { name?: string; email?: string }) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/g/${slug}/visitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) onDone();
    else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'Something went wrong.');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (required) {
      if (!name.trim()) return setError('Please enter your name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return setError('Please enter a valid email.');
      }
    }
    await createVisitor({
      name: name.trim() || undefined,
      email: email.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-6">
      <div className="w-full max-w-sm bg-[#fafafa] p-8 dark:bg-[#111]">
        <h2 className="text-sm font-medium tracking-widest uppercase">Welcome</h2>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={required ? 'Name (required)' : 'Name'}
            className="w-full border-b border-neutral-300 bg-transparent py-2 text-sm outline-none dark:border-neutral-700"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={required ? 'Email (required)' : 'Email'}
            className="w-full border-b border-neutral-300 bg-transparent py-2 text-sm outline-none dark:border-neutral-700"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={busy} className="w-full border py-2 text-xs uppercase">
            Continue
          </button>
          {!required && (
            <button type="button" onClick={() => createVisitor({})} className="w-full text-xs underline">
              Skip
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
