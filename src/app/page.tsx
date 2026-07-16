import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import JsonLd from '@/components/JsonLd';
import WorkSection, { type WorkItem } from '@/components/WorkSection';
import { getSetting } from '@/lib/settings';
import { coverPhotoId, getPublishedPortfolioGalleries } from '@/lib/public-data';
import { getGalleryTags } from '@/lib/tags';
import { sitePersonName } from '@/lib/feed-data';
import { BASE_URL } from '@/lib/env';
import { parseLang } from '@/lib/i18n';
import type { Gallery } from '@/db/schema';

export const dynamic = 'force-dynamic';

function toWorkItems(gs: Gallery[]): WorkItem[] {
  return gs.map((g) => ({
    gallery: g,
    cover: coverPhotoId(g),
    tags: getGalleryTags(g.id).map((t) => t.name),
  }));
}

export default function HomePage() {
  const allPortfolios = getPublishedPortfolioGalleries();
  const featured = allPortfolios.filter((g) => g.featured);
  const workItems = toWorkItems(featured);
  const otherItems = toWorkItems(allPortfolios.filter((g) => !g.featured));
  const heroItem =
    toWorkItems(allPortfolios).find((g) => g.cover) ?? workItems.find((g) => g.cover) ?? null;

  const eyebrow = getSetting('homeEyebrow') || 'Photographer';
  const headline = getSetting('homeHeadline') || 'The moment, kept.';
  const intro =
    getSetting('homeIntro') ||
    'Editorial, event, and portrait photography — with private, proof-ready galleries for clients.';

  const allTags = [
    ...new Set([...workItems, ...otherItems].flatMap((i) => i.tags)),
  ].sort();
  const lang = parseLang(getSetting('defaultLanguage'));

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
                objectPosition: `${heroItem.gallery.coverFocusX}% ${heroItem.gallery.coverFocusY}%`,
              }}
            />
          )}
        </div>
      </section>

      <WorkSection
        featuredItems={workItems}
        otherItems={otherItems}
        allTags={allTags}
        lang={lang}
      />
      <SiteFooter />
    </div>
  );
}
