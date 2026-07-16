'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Reveal from '@/components/Reveal';
import { coverObjectPosition } from '@/lib/cover-focus';
import type { Gallery } from '@/db/schema';
import { t, type Lang } from '@/lib/i18n';

export type WorkItem = {
  gallery: Gallery;
  cover: string | null;
  tags: string[];
};

function WorkGrid({ items, startIndex = 0 }: { items: WorkItem[]; startIndex?: number }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ gallery, cover }, i) => (
        <Reveal key={gallery.id} delay={((startIndex + i) % 3) * 80}>
          <Link href={`/portfolio/${gallery.slug}`} className="group block">
            <div className="aspect-[4/3] overflow-hidden bg-line/60 dark:bg-line-dark/50">
              {cover && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`/img/${cover}/thumb`}
                  alt={gallery.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                  style={{
                    objectPosition: coverObjectPosition(
                      gallery.coverFocusX,
                      gallery.coverFocusY,
                    ),
                  }}
                />
              )}
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <p className="text-[15px] font-medium tracking-tight transition-colors group-hover:text-accent dark:group-hover:text-accent-dark">
                {gallery.title}
              </p>
              {gallery.eventDate && (
                <span className="shrink-0 text-[12px] text-muted tabular-nums dark:text-muted-dark">
                  {new Date(gallery.eventDate).getFullYear()}
                </span>
              )}
            </div>
            {gallery.showLocation && gallery.locationName && (
              <p className="mt-0.5 text-[12px] text-muted dark:text-muted-dark">
                {gallery.locationName}
              </p>
            )}
          </Link>
        </Reveal>
      ))}
    </div>
  );
}

export default function WorkSection({
  featuredItems,
  otherItems,
  allTags,
  lang = 'en',
}: {
  featuredItems: WorkItem[];
  otherItems: WorkItem[];
  allTags: string[];
  lang?: Lang;
}) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);

  const allItems = useMemo(
    () => [...featuredItems, ...otherItems],
    [featuredItems, otherItems],
  );

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const { gallery } of allItems) {
      if (gallery.eventDate) set.add(new Date(gallery.eventDate).getFullYear());
    }
    return [...set].sort((a, b) => b - a);
  }, [allItems]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allItems.filter(({ gallery, tags }) => {
      if (needle && !gallery.title.toLowerCase().includes(needle)) return false;
      if (tag && !tags.includes(tag)) return false;
      if (year && (!gallery.eventDate || new Date(gallery.eventDate).getFullYear() !== year)) {
        return false;
      }
      return true;
    });
  }, [allItems, query, tag, year]);

  const hasFilter = query.trim().length > 0 || tag !== null || year !== null;

  function clearFilters() {
    setQuery('');
    setTag(null);
    setYear(null);
  }

  if (featuredItems.length === 0 && otherItems.length === 0) return null;

  return (
    <section id="work" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <div className="mb-10 space-y-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(lang, 'workSearchPlaceholder')}
          className="w-full max-w-md border-b border-line bg-transparent py-2 text-sm outline-none focus:border-accent dark:border-line-dark dark:focus:border-accent-dark"
        />
        <div className="flex flex-wrap items-center gap-2">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(year === y ? null : y)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                year === y
                  ? 'border-ink dark:border-ink-dark'
                  : 'border-line text-muted dark:border-line-dark dark:text-muted-dark'
              }`}
            >
              {y}
            </button>
          ))}
          {allTags.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setTag(tag === name ? null : name)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                tag === name
                  ? 'border-ink dark:border-ink-dark'
                  : 'border-line text-muted dark:border-line-dark dark:text-muted-dark'
              }`}
            >
              {name}
            </button>
          ))}
          {hasFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-muted underline underline-offset-4 dark:text-muted-dark"
            >
              {t(lang, 'workClearFilters')}
            </button>
          )}
        </div>
      </div>

      {hasFilter ? (
        <div>
          <div className="mb-10 flex items-baseline justify-between">
            <h2 className="display text-2xl font-semibold">{t(lang, 'workResults')}</h2>
            <span className="text-[12px] text-muted dark:text-muted-dark">
              {filtered.length} {filtered.length === 1 ? 'project' : 'projects'}
            </span>
          </div>
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted dark:text-muted-dark">
              {t(lang, 'workNoMatches')}
            </p>
          ) : (
            <WorkGrid items={filtered} />
          )}
        </div>
      ) : (
        <>
          {featuredItems.length > 0 && (
            <div className={otherItems.length > 0 ? 'mb-20 md:mb-28' : ''}>
              <div className="mb-10 flex items-baseline justify-between">
                <h2 className="display text-2xl font-semibold">Featured Work</h2>
                <span className="text-[12px] text-muted dark:text-muted-dark">
                  {featuredItems.length}{' '}
                  {featuredItems.length === 1 ? 'project' : 'projects'}
                </span>
              </div>
              <WorkGrid items={featuredItems} />
            </div>
          )}
          {otherItems.length > 0 && (
            <div>
              <div className="mb-10 flex items-baseline justify-between">
                <h2 className="display text-2xl font-semibold">More Work</h2>
                <span className="text-[12px] text-muted dark:text-muted-dark">
                  {otherItems.length} {otherItems.length === 1 ? 'project' : 'projects'}
                </span>
              </div>
              <WorkGrid items={otherItems} startIndex={featuredItems.length} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
