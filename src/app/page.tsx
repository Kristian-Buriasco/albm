import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import Reveal from '@/components/Reveal';
import { getSetting } from '@/lib/settings';
import {
  coverPhotoId,
  getPublishedPortfolioGalleries,
  getSelectedWorkGalleries,
} from '@/lib/public-data';
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
  const featured = getSelectedWorkGalleries();
  const featuredIds = new Set(featured.map((g) => g.id));
  const others = getPublishedPortfolioGalleries().filter((g) => !featuredIds.has(g.id));

  const toItems = (gs: Gallery[]): Item[] =>
    gs.map((g) => ({ gallery: g, cover: coverPhotoId(g) }));
  const featuredItems = toItems(featured);
  const otherItems = toItems(others);

  const heroItem =
    featuredItems.find((g) => g.cover) ?? otherItems.find((g) => g.cover) ?? null;

  const eyebrow = getSetting('homeEyebrow') || 'Photographer';
  const headline = getSetting('homeHeadline') || 'The moment, kept.';
  const intro =
    getSetting('homeIntro') ||
    'Editorial, event, and portrait photography — with private, proof-ready galleries for clients.';

  const hasFeatured = featuredItems.length > 0;

  return (
    <div>
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
            />
          )}
        </div>
      </section>

      {(hasFeatured || otherItems.length > 0) && (
        <section id="work" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          {hasFeatured && (
            <>
              <div className="mb-10 flex items-baseline justify-between">
                <h2 className="display text-2xl font-semibold">Selected Work</h2>
                <span className="text-[12px] text-muted dark:text-muted-dark">
                  {featuredItems.length}{' '}
                  {featuredItems.length === 1 ? 'project' : 'projects'}
                </span>
              </div>
              <WorkGrid items={featuredItems} />
            </>
          )}

          {otherItems.length > 0 && (
            <>
              <div
                className={`mb-10 flex items-baseline justify-between ${hasFeatured ? 'mt-24' : ''}`}
              >
                <h2 className="display text-2xl font-semibold">
                  {hasFeatured ? 'More Work' : 'Work'}
                </h2>
                <span className="text-[12px] text-muted dark:text-muted-dark">
                  {otherItems.length}{' '}
                  {otherItems.length === 1 ? 'project' : 'projects'}
                </span>
              </div>
              <WorkGrid items={otherItems} startIndex={featuredItems.length} />
            </>
          )}
        </section>
      )}
      <SiteFooter />
    </div>
  );
}
