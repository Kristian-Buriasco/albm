'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PhotoComments from './PhotoComments';

export interface LightboxPhoto {
  id: string;
  filename: string;
  width: number;
  height: number;
  exifLine?: string | null;
  alt?: string;
  placeholder?: string | null;
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
  downloadSizes?: Array<'web' | 'print' | 'original'>;
  downloadSizeLabels?: { web: string; print: string; original: string; label: string };
  showLikeCounts?: boolean;
  likeCounts?: Record<string, number>;
  commentsEnabled?: boolean;
  commentsApiBase?: string;
  onPhotoOpen?: (photoId: string) => void;
  slideshowLabel?: { play: string; pause: string };
}

const SLIDE_MS = 4000;

export default function Lightbox({
  photos,
  index,
  onClose,
  onNavigate,
  showFilename = false,
  selectedIds,
  onToggleSelect,
  downloadEnabled = false,
  downloadSizes = ['original'],
  downloadSizeLabels,
  showLikeCounts = false,
  likeCounts,
  commentsEnabled = false,
  commentsApiBase,
  onPhotoOpen,
  slideshowLabel,
}: Props) {
  const photo = photos[index];
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const prev = useCallback(() => {
    onNavigate((index - 1 + photos.length) % photos.length);
  }, [index, photos.length, onNavigate]);
  const next = useCallback(() => {
    onNavigate((index + 1) % photos.length);
  }, [index, photos.length, onNavigate]);

  useEffect(() => {
    if (photo?.id) onPhotoOpen?.(photo.id);
  }, [photo?.id, onPhotoOpen]);

  useEffect(() => {
    const prevIdx = (index - 1 + photos.length) % photos.length;
    const nextIdx = (index + 1) % photos.length;
    for (const p of [photos[prevIdx], photos[nextIdx]]) {
      if (!p) continue;
      const img = new Image();
      img.src = `/img/${p.id}/web`;
    }
  }, [index, photos]);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    const t = setInterval(next, SLIDE_MS);
    return () => clearInterval(t);
  }, [playing, reducedMotion, next]);

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
  const alt = photo.alt ?? photo.filename;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#050505]/97 text-neutral-200"
      role="dialog"
      aria-modal="true"
      onClick={() => setPlaying(false)}
      onTouchStart={(e) => {
        touchStart.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }}
      onTouchEnd={(e) => {
        if (!touchStart.current) return;
        const dx = e.changedTouches[0].clientX - touchStart.current.x;
        const dy = e.changedTouches[0].clientY - touchStart.current.y;
        touchStart.current = null;
        if (dy > 64 && Math.abs(dy) > Math.abs(dx)) onClose();
        else if (dx > 48) prev();
        else if (dx < -48) next();
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-xs">
        <span className="text-neutral-400">
          {index + 1} / {photos.length}
        </span>
        <div className="flex items-center gap-4">
          {photos.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPlaying((p) => !p);
              }}
              className="p-1 text-neutral-300 hover:text-white"
              aria-label={playing ? slideshowLabel?.pause : slideshowLabel?.play}
            >
              {playing ? '⏸' : '▶'}
            </button>
          )}
          {onToggleSelect && (
            <button
              type="button"
              onClick={() => onToggleSelect(photo.id)}
              aria-label={selected ? 'Remove from selection' : 'Add to selection'}
              className="flex items-center gap-1 p-1"
            >
              <HeartIcon filled={selected} className="h-5 w-5" />
              {showLikeCounts && (
                <span className="tabular-nums text-neutral-400">
                  {likeCounts?.[photo.id] ?? 0}
                </span>
              )}
            </button>
          )}
          {downloadEnabled && downloadSizes.length === 1 && (
            <a
              href={`/dl/${photo.id}?size=${downloadSizes[0]}`}
              aria-label={downloadSizeLabels?.label ?? 'Download photo'}
              className="p-1 text-neutral-300 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
              </svg>
            </a>
          )}
          {downloadEnabled && downloadSizes.length > 1 && (
            <div className="relative flex items-center gap-1">
              {downloadSizes.map((sz) => (
                <a
                  key={sz}
                  href={`/dl/${photo.id}?size=${sz}`}
                  className="rounded border border-white/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300 hover:text-white"
                >
                  {downloadSizeLabels?.[sz] ?? sz}
                </a>
              ))}
            </div>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-neutral-300 hover:text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={photo.id}
          src={`/img/${photo.id}/web`}
          alt={alt}
          className={`max-h-[70vh] max-w-full object-contain select-none ${reducedMotion ? '' : 'transition-opacity duration-200'}`}
          draggable={false}
        />
      </div>

      {(showFilename || photo.exifLine) && (
        <div className="space-y-1 pb-2 text-center text-[11px] tracking-wide text-neutral-500">
          {showFilename && <div>{photo.filename}</div>}
          {photo.exifLine && <div>{photo.exifLine}</div>}
        </div>
      )}

      {commentsEnabled && commentsApiBase && (
        <PhotoComments apiBase={commentsApiBase} photoId={photo.id} enabled />
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
