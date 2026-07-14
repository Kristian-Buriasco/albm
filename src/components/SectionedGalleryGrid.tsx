'use client';

import { useMemo, useState } from 'react';
import Lightbox, { HeartIcon, type LightboxPhoto } from './Lightbox';
import PhotoComments from './PhotoComments';

export type SectionGroup = {
  id: string | null;
  title: string;
  photos: LightboxPhoto[];
};

export default function SectionedGalleryGrid({
  sections,
  renderTileOverlay,
  onOpenLightbox,
  commentCounts,
  commentsEnabled,
}: {
  sections: SectionGroup[];
  renderTileOverlay: (photo: LightboxPhoto) => React.ReactNode;
  onOpenLightbox: (flatIndex: number) => void;
  commentCounts?: Record<string, number>;
  commentsEnabled?: boolean;
}) {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const flat = useMemo(() => sections.flatMap((s) => s.photos), [sections]);
  const hasNamedSections = sections.some((s) => s.id !== null);

  let offset = 0;
  return (
    <div>
      {hasNamedSections && (
        <div className="sticky top-14 z-10 mb-4 flex flex-wrap gap-2 bg-[#fafafa]/90 py-2 backdrop-blur dark:bg-[#0a0a0a]/90">
          <button
            type="button"
            onClick={() => setActiveSection(null)}
            className={`rounded-full border px-3 py-1 text-xs ${
              activeSection === null
                ? 'border-neutral-900 dark:border-neutral-100'
                : 'border-neutral-300 dark:border-neutral-700'
            }`}
          >
            All
          </button>
          {sections
            .filter((s) => s.id !== null)
            .map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSection(s.id)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  activeSection === s.id
                    ? 'border-neutral-900 dark:border-neutral-100'
                    : 'border-neutral-300 dark:border-neutral-700'
                }`}
              >
                {s.title}
              </button>
            ))}
        </div>
      )}
      {sections.map((section) => {
        if (activeSection !== null && section.id !== activeSection) {
          offset += section.photos.length;
          return null;
        }
        const startOffset = offset;
        const block = (
          <div key={section.id ?? 'ungrouped'} className="mb-8">
            {section.id !== null && (
              <h2 className="mb-3 text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
                {section.title}
              </h2>
            )}
            <div className="columns-2 gap-2 md:columns-3 xl:columns-4 [&>div]:mb-2">
              {section.photos.map((p, i) => (
                <div key={p.id} className="group relative break-inside-avoid">
                  <button
                    type="button"
                    onClick={() => onOpenLightbox(startOffset + i)}
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
                  {renderTileOverlay(p)}
                  {commentsEnabled && (commentCounts?.[p.id] ?? 0) > 0 && (
                    <span className="absolute left-2 bottom-2 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                      {commentCounts![p.id]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
        offset += section.photos.length;
        return block;
      })}
      {flat.length === 0 && (
        <p className="py-24 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No photos yet.
        </p>
      )}
    </div>
  );
}

export { HeartIcon, Lightbox, PhotoComments };
