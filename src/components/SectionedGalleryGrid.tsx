'use client';

import { useMemo, useState } from 'react';
import Lightbox, { HeartIcon, type LightboxPhoto } from './Lightbox';
import PhotoComments from './PhotoComments';
import BlurImage from './BlurImage';

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
  selectedIds,
  photoTagIds,
  tagOptions,
  labels,
  themed = false,
}: {
  sections: SectionGroup[];
  renderTileOverlay: (photo: LightboxPhoto) => React.ReactNode;
  onOpenLightbox: (flatIndex: number) => void;
  commentCounts?: Record<string, number>;
  commentsEnabled?: boolean;
  selectedIds?: Set<string>;
  photoTagIds?: Record<string, string[]>;
  tagOptions?: { id: string; name: string }[];
  labels?: { allSections: string; noPhotos: string };
  /**
   * True when the gallery has a design theme applied — switches the grid
   * from the fixed Tailwind `columns-2 md:columns-3 xl:columns-4` masonry
   * to the theme's `--gallery-columns`/`--gallery-gap`/`--gallery-radius`
   * CSS vars via inline style. Left false (default) for every unthemed
   * gallery so today's layout stays pixel-identical — inline styles always
   * win over the Tailwind classes, so they must only be set when a theme
   * is actually driving the vars.
   */
  themed?: boolean;
}) {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const filteredSections = useMemo(() => {
    if (!activeTag || !photoTagIds) return sections;
    return sections
      .map((s) => ({
        ...s,
        photos: s.photos.filter((p) => photoTagIds[p.id]?.includes(activeTag)),
      }))
      .filter((s) => s.photos.length > 0);
  }, [sections, activeTag, photoTagIds]);

  const flat = useMemo(() => filteredSections.flatMap((s) => s.photos), [filteredSections]);
  const hasNamedSections = sections.some((s) => s.id !== null);
  const showTagFilters = tagOptions && tagOptions.length > 0;

  let offset = 0;
  return (
    <div>
      {(hasNamedSections || showTagFilters) && (
        <div className="sticky top-14 z-10 mb-4 flex flex-wrap gap-2 bg-paper/90 py-2 backdrop-blur dark:bg-paper-dark/90">
          {hasNamedSections && (
            <>
              <button
                type="button"
                onClick={() => setActiveSection(null)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  activeSection === null
                    ? 'border-ink dark:border-ink-dark'
                    : 'border-line dark:border-line-dark'
                }`}
              >
                {labels?.allSections ?? 'All'}
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
                        ? 'border-ink dark:border-ink-dark'
                        : 'border-line dark:border-line-dark'
                    }`}
                  >
                    {s.title}
                  </button>
                ))}
            </>
          )}
          {showTagFilters &&
            tagOptions!.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTag(activeTag === t.id ? null : t.id)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  activeTag === t.id
                    ? 'border-accent text-accent dark:border-accent-dark dark:text-accent-dark'
                    : 'border-line dark:border-line-dark'
                }`}
              >
                {t.name}
              </button>
            ))}
        </div>
      )}
      {filteredSections.map((section) => {
        if (activeSection !== null && section.id !== activeSection) {
          offset += section.photos.length;
          return null;
        }
        const startOffset = offset;
        const block = (
          <div key={section.id ?? 'ungrouped'} className="mb-8">
            {section.id !== null && (
              <h2 className="mb-3 text-xs tracking-widest text-muted uppercase dark:text-muted-dark">
                {section.title}
              </h2>
            )}
            <div
              className="columns-2 gap-2 md:columns-3 xl:columns-4 [&>div]:mb-2"
              style={
                themed
                  ? { columnCount: 'var(--gallery-columns, 4)', columnGap: 'var(--gallery-gap, 8px)' }
                  : undefined
              }
            >
              {section.photos.map((p, i) => {
                const isSelected = selectedIds?.has(p.id) ?? false;
                return (
                  <div
                    key={p.id}
                    className={`group relative break-inside-avoid ${
                      isSelected
                        ? 'rounded ring-2 ring-accent ring-offset-2 ring-offset-paper dark:ring-accent-dark dark:ring-offset-paper-dark'
                        : ''
                    }`}
                    style={themed ? { marginBottom: 'var(--gallery-gap, 8px)' } : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenLightbox(startOffset + i)}
                      className="block w-full cursor-zoom-in"
                    >
                      <BlurImage
                        src={`/img/${p.id}/md${p.updatedAt ? `?v=${p.updatedAt}` : ''}`}
                        srcSet={`/img/${p.id}/thumb${p.updatedAt ? `?v=${p.updatedAt}` : ''} 400w, /img/${p.id}/md${p.updatedAt ? `?v=${p.updatedAt}` : ''} 1280w`}
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        alt={p.alt ?? p.filename}
                        width={p.width}
                        height={p.height}
                        placeholder={p.placeholder}
                        className={`w-full ${isSelected ? 'brightness-90' : ''}`}
                        style={themed ? { borderRadius: 'var(--gallery-radius, 0px)' } : undefined}
                      />
                    </button>
                    {isSelected && (
                      <span className="pointer-events-none absolute inset-0 bg-accent/10 dark:bg-accent-dark/15" />
                    )}
                    {renderTileOverlay(p)}
                    {commentsEnabled && (commentCounts?.[p.id] ?? 0) > 0 && (
                      <span className="absolute left-2 bottom-2 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                        {commentCounts![p.id]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
        offset += section.photos.length;
        return block;
      })}
      {flat.length === 0 && (
        <p className="py-24 text-center text-sm text-muted dark:text-muted-dark">
          {labels?.noPhotos ?? 'No photos yet.'}
        </p>
      )}
    </div>
  );
}

export { HeartIcon, Lightbox, PhotoComments, type LightboxPhoto };
