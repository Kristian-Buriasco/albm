'use client';

import { useCallback, useMemo, useState } from 'react';
import Lightbox, { HeartIcon, type LightboxPhoto } from '@/components/Lightbox';
import ThemeToggle from '@/components/ThemeToggle';

interface Props {
  slug: string;
  title: string;
  eventDate: number | null;
  clientInfoMode: 'off' | 'optional' | 'required';
  downloadEnabled: boolean;
  photos: LightboxPhoto[];
  hasVisitor: boolean;
  initialSelectedIds: string[];
}

export default function GalleryClient({
  slug,
  title,
  eventDate,
  clientInfoMode,
  downloadEnabled,
  photos,
  hasVisitor,
  initialSelectedIds,
}: Props) {
  const [visitorReady, setVisitorReady] = useState(hasVisitor);
  const [showInfoModal, setShowInfoModal] = useState(
    !hasVisitor && clientInfoMode !== 'off',
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelectedIds),
  );
  const [onlyMine, setOnlyMine] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);

  // With mode 'off', the anonymous visitor is created lazily on first selection.
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

  const toggleSelect = useCallback(
    async (photoId: string) => {
      const isSelected = selected.has(photoId);
      // Optimistic update
      setSelected((prev) => {
        const next = new Set(prev);
        if (isSelected) next.delete(photoId);
        else next.add(photoId);
        return next;
      });
      if (!(await ensureVisitor())) {
        // Roll back if we couldn't create a visitor.
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
    [selected, slug, ensureVisitor],
  );

  const visible = useMemo(
    () => (onlyMine ? photos.filter((p) => selected.has(p.id)) : photos),
    [photos, onlyMine, selected],
  );

  const gateContent = clientInfoMode === 'required' && showInfoModal;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-neutral-200/60 bg-[#fafafa]/90 backdrop-blur dark:border-neutral-800/60 dark:bg-[#0a0a0a]/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium tracking-widest uppercase">
              {title}
            </h1>
            <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              {eventDate
                ? new Date(eventDate).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }) + ' · '
                : ''}
              {photos.length} photos
              {selected.size > 0 ? ` · ${selected.size} selected` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
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
                className="rounded-full border border-neutral-300 px-3 py-1.5 text-neutral-600 transition-colors hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500"
              >
                Download all
              </a>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {!gateContent && (
        <main className="mx-auto max-w-7xl px-2 py-4 sm:px-4">
          {visible.length === 0 ? (
            <p className="py-24 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {onlyMine ? 'No selections yet.' : 'No photos yet.'}
            </p>
          ) : (
            <div className="columns-2 gap-2 md:columns-3 xl:columns-4 [&>div]:mb-2">
              {visible.map((p) => (
                <div key={p.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => setLightbox(photos.indexOf(p))}
                    className="block w-full cursor-zoom-in"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/img/${p.id}/thumb`}
                      alt={p.filename}
                      loading="lazy"
                      width={p.width}
                      height={p.height}
                      className="w-full"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSelect(p.id)}
                    aria-label={
                      selected.has(p.id) ? 'Remove from selection' : 'Add to selection'
                    }
                    className={`absolute right-2 bottom-2 rounded-full p-1.5 transition-opacity ${
                      selected.has(p.id)
                        ? 'text-white opacity-100 drop-shadow'
                        : 'text-white/90 opacity-0 drop-shadow group-hover:opacity-100 max-sm:opacity-70'
                    }`}
                  >
                    <HeartIcon filled={selected.has(p.id)} className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {lightbox !== null && (
        <Lightbox
          photos={photos}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
          showFilename
          selectedIds={selected}
          onToggleSelect={toggleSelect}
          downloadEnabled={downloadEnabled}
        />
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
    if (res.ok) {
      onDone();
    } else {
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
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setError('Please enter a valid email.');
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
        <p className="mt-2 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
          {required
            ? 'Please introduce yourself to view this gallery.'
            : 'Let us know who you are so your photo selections carry your name.'}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={required ? 'Name (required)' : 'Name'}
            className="w-full border-b border-neutral-300 bg-transparent py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={required ? 'Email (required)' : 'Email'}
            className="w-full border-b border-neutral-300 bg-transparent py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
          />
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full border border-neutral-900 py-2 text-xs tracking-widest uppercase transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-40 dark:border-neutral-100 dark:hover:bg-neutral-100 dark:hover:text-black"
          >
            {busy ? 'One moment…' : 'Continue'}
          </button>
          {!required && (
            <button
              type="button"
              disabled={busy}
              onClick={() => createVisitor({})}
              className="w-full py-1 text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              Skip
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
