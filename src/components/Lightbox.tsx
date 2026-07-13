'use client';

import { useCallback, useEffect, useRef } from 'react';

export interface LightboxPhoto {
  id: string;
  filename: string;
  width: number;
  height: number;
}

interface Props {
  photos: LightboxPhoto[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  showFilename?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (photoId: string) => void;
  downloadEnabled?: boolean;
}

export default function Lightbox({
  photos,
  index,
  onClose,
  onNavigate,
  showFilename = false,
  selectedIds,
  onToggleSelect,
  downloadEnabled = false,
}: Props) {
  const photo = photos[index];
  const touchStartX = useRef<number | null>(null);

  const prev = useCallback(() => {
    onNavigate((index - 1 + photos.length) % photos.length);
  }, [index, photos.length, onNavigate]);
  const next = useCallback(() => {
    onNavigate((index + 1) % photos.length);
  }, [index, photos.length, onNavigate]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, prev, next]);

  if (!photo) return null;
  const selected = selectedIds?.has(photo.id) ?? false;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#050505]/97 text-neutral-200"
      role="dialog"
      aria-modal="true"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (dx > 48) prev();
        else if (dx < -48) next();
      }}
    >
      {/* top bar */}
      <div className="flex items-center justify-between px-4 py-3 text-xs">
        <span className="text-neutral-400">
          {index + 1} / {photos.length}
        </span>
        <div className="flex items-center gap-4">
          {onToggleSelect && (
            <button
              type="button"
              onClick={() => onToggleSelect(photo.id)}
              aria-label={selected ? 'Remove from selection' : 'Add to selection'}
              className="p-1"
            >
              <HeartIcon filled={selected} className="h-5 w-5" />
            </button>
          )}
          {downloadEnabled && (
            <a
              href={`/dl/${photo.id}`}
              aria-label="Download photo"
              className="p-1 text-neutral-300 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
              </svg>
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-neutral-300 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      {/* image */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-2">
        <button
          type="button"
          onClick={prev}
          aria-label="Previous photo"
          className="absolute left-0 top-0 z-10 hidden h-full w-1/6 cursor-w-resize items-center justify-start pl-4 text-neutral-500 hover:text-white sm:flex"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={photo.id}
          src={`/img/${photo.id}/web`}
          alt={photo.filename}
          className="max-h-full max-w-full object-contain select-none"
          draggable={false}
        />
        <button
          type="button"
          onClick={next}
          aria-label="Next photo"
          className="absolute right-0 top-0 z-10 hidden h-full w-1/6 cursor-e-resize items-center justify-end pr-4 text-neutral-500 hover:text-white sm:flex"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {showFilename && (
        <div className="pb-3 text-center text-[11px] tracking-wide text-neutral-500">
          {photo.filename}
        </div>
      )}
    </div>
  );
}

export function HeartIcon({
  filled,
  className,
}: {
  filled: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      style={filled ? { color: '#fff' } : undefined}
    >
      <path d="M12 21s-7.5-4.7-10-9.3C.6 8.6 2.6 4.5 6.4 4.5c2.2 0 3.8 1.2 5.6 3.3 1.8-2.1 3.4-3.3 5.6-3.3 3.8 0 5.8 4.1 4.4 7.2C19.5 16.3 12 21 12 21z" />
    </svg>
  );
}
