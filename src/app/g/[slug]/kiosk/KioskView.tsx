'use client';

import { useEffect, useRef, useState } from 'react';

type KioskPhoto = {
  id: string;
  filename: string;
  width: number;
  height: number;
  updatedAt: number;
  placeholder: string | null;
};

const SLIDE_MS = 7000;
const POLL_MS = 25000;
const NEW_BADGE_MS = 20000;

function imgSrc(photo: KioskPhoto, variant: 'md' | 'web' = 'web') {
  return `/img/${photo.id}/${variant}?v=${photo.updatedAt}`;
}

export default function KioskView({
  slug,
  title,
  initialPhotos,
}: {
  slug: string;
  title: string;
  initialPhotos: KioskPhoto[];
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [index, setIndex] = useState(0);
  const [newestId, setNewestId] = useState<string | null>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Auto-rotate through the current photo list.
  useEffect(() => {
    if (photos.length < 2) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % photos.length);
    }, SLIDE_MS);
    return () => clearInterval(t);
  }, [photos.length]);

  // Poll for newly-ready uploads and prepend them (live wall).
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/g/${slug}/kiosk/feed`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { photos: KioskPhoto[] };
        setPhotos((current) => {
          const knownIds = new Set(current.map((p) => p.id));
          const fresh = data.photos.filter((p) => !knownIds.has(p.id));
          if (fresh.length === 0) return current;
          setNewestId(fresh[0].id);
          setIndex(0);
          return [...fresh, ...current];
        });
      } catch {
        /* offline blip — try again next tick */
      }
    };
    const t = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [slug]);

  // Clear the "newest" badge after a while.
  useEffect(() => {
    if (!newestId) return;
    const t = setTimeout(() => setNewestId(null), NEW_BADGE_MS);
    return () => clearTimeout(t);
  }, [newestId]);

  if (photos.length === 0) {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-black text-neutral-500">
        <p className="text-sm tracking-widest uppercase">{title} — waiting for photos…</p>
      </main>
    );
  }

  const current = photos[index] ?? photos[0];

  return (
    <main className="fixed inset-0 overflow-hidden bg-black">
      {photos.map((photo, i) => (
        <div
          key={photo.id}
          className="absolute inset-0 transition-opacity duration-[1500ms] ease-in-out motion-reduce:transition-none"
          style={{ opacity: i === index ? 1 : 0 }}
          aria-hidden={i === index ? undefined : true}
        >
          {photo.placeholder && (
            <img
              src={photo.placeholder}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-contain opacity-60 blur-2xl"
            />
          )}
          {i === index && (
            <img
              src={imgSrc(photo)}
              srcSet={`${imgSrc(photo, 'md')} 1280w, ${imgSrc(photo, 'web')} 2048w`}
              sizes="100vw"
              alt=""
              className="kiosk-kenburns absolute inset-0 h-full w-full object-contain motion-reduce:animate-none"
            />
          )}
        </div>
      ))}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/70 to-transparent p-8">
        <p className="text-xs tracking-[0.3em] text-neutral-300 uppercase">{title}</p>
        {newestId === current.id && (
          <p className="rounded-full border border-white/40 px-3 py-1 text-[10px] tracking-widest text-white uppercase">
            Just added
          </p>
        )}
      </div>

      <style>{`
        @keyframes kiosk-kenburns {
          0% {
            transform: scale(1);
          }
          100% {
            transform: scale(1.08);
          }
        }
        .kiosk-kenburns {
          animation: kiosk-kenburns ${SLIDE_MS + 1500}ms ease-out forwards;
        }
      `}</style>
    </main>
  );
}
