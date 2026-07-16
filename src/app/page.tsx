import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import Reveal from '@/components/Reveal';
import JsonLd from '@/components/JsonLd';
import { getSetting } from '@/lib/settings';
import {
  coverPhotoId,
  getPublishedPortfolioGalleries,
} from '@/lib/public-data';
import { coverObjectPosition } from '@/lib/cover-focus';
import { sitePersonName } from '@/lib/feed-data';
import { BASE_URL } from '@/lib/env';
import type { Gallery } from '@/db/schema';

export const dynamic = 'force-dynamic';

type Item = { gallery: Gallery; cover: string | null };

function WorkGrid({ items, startIndex = 0 }: { items: Item[]; startIndex?: number }) {
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

export default function HomePage() {
  const allPortfolios = getPublishedPortfolioGalleries();
  const featured = allPortfolios.filter((g) => g.featured);
  const toItems = (gs: Gallery[]): Item[] =>
    gs.map((g) => ({ gallery: g, cover: coverPhotoId(g) }));
  const workItems = toItems(featured);
  // Everything published that isn't featured still shows, under "More Work" —
  // so a portfolio nobody has curated as featured is never invisible.
  const otherItems = toItems(allPortfolios.filter((g) => !g.featured));
  const heroItem =
    toItems(allPortfolios).find((g) => g.cover) ??
    workItems.find((g) => g.cover) ??
    null;

  const eyebrow = getSetting('homeEyebrow') || 'Photographer';
  const headline = getSetting('homeHeadline') || 'The moment, kept.';
  const intro =
    getSetting('homeIntro') ||
    'Editorial, event, and portrait photography — with private, proof-ready galleries for clients.';

  const hasFeatured = workItems.length > 0;
  const hasOthers = otherItems.length > 0;

  return (
    <div>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: sitePersonName(),
          url: BASE_URL,
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: sitePersonName(),
          url: BASE_URL,
        }}
      />
      <SiteHeader />

      {/* Split hero: positioning left, photo right */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-stretch gap-px overflow-hidden border-y border-line md:grid-cols-2 dark:border-line-dark">
        <div className="flex flex-col justify-center px-6 py-16 md:py-24">
          <p className="mb-5 text-[11px] tracking-[0.16em] text-muted uppercase dark:text-muted-dark">
            {eyebrow}
          </p>
          <h1 className="display text-4xl leading-[1.02] font-semibold text-balance sm:text-5xl">
            {headline}
          </h1>
          <p className="mt-6 max-w-[36ch] text-[15px] leading-relaxed text-muted dark:text-muted-dark">
            {intro}
          </p>
          <div className="mt-9 flex items-center gap-6 text-[13px]">
            <Link
              href="#work"
              className="border-b border-ink pb-0.5 transition-colors hover:border-accent hover:text-accent dark:border-ink-dark dark:hover:border-accent-dark dark:hover:text-accent-dark"
            >
              View work
            </Link>
            <Link
              href="/contact"
              className="text-muted transition-colors hover:text-ink dark:text-muted-dark dark:hover:text-ink-dark"
            >
              Get in touch
            </Link>
          </div>
        </div>
        <div className="relative min-h-[46vh] bg-line/50 md:min-h-full dark:bg-line-dark/40">
          {heroItem?.cover && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/img/${heroItem.cover}/web`}
              alt={heroItem.gallery.title}
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                objectPosition: coverObjectPosition(
                  heroItem.gallery.coverFocusX,
                  heroItem.gallery.coverFocusY,
                ),
              }}
            />
          )}
        </div>
      </section>

      {(hasFeatured || hasOthers) && (
        <section id="work" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          {hasFeatured && (
            <div className={hasOthers ? 'mb-20 md:mb-28' : ''}>
              <div className="mb-10 flex items-baseline justify-between">
                <h2 className="display text-2xl font-semibold">Featured Work</h2>
                <span className="text-[12px] text-muted dark:text-muted-dark">
                  {workItems.length} {workItems.length === 1 ? 'project' : 'projects'}
                </span>
              </div>
              <WorkGrid items={workItems} />
            </div>
          )}

          {hasOthers && (
            <div>
              <div className="mb-10 flex items-baseline justify-between">
                <h2 className="display text-2xl font-semibold">More Work</h2>
                <span className="text-[12px] text-muted dark:text-muted-dark">
                  {otherItems.length} {otherItems.length === 1 ? 'project' : 'projects'}
                </span>
              </div>
              <WorkGrid items={otherItems} startIndex={hasFeatured ? workItems.length : 0} />
            </div>
          )}
        </section>
      )}
      <SiteFooter />
    </div>
  );
}
