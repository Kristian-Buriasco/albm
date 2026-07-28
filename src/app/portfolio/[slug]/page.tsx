import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { findCurrentSlugFor } from '@/lib/slug-history';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import AdminEditLink from '@/components/AdminEditLink';
import GalleryViewPing from '@/components/GalleryViewPing';
import PortfolioGrid from '@/components/PortfolioGrid';
import JsonLd from '@/components/JsonLd';
import { BASE_URL } from '@/lib/env';
import { buildSectionPayloads } from '@/lib/gallery-page-data';
import { previewPhotoId, getReadyPhotos } from '@/lib/public-data';
import { effectiveGallerySeo } from '@/lib/gallery-seo';
import { sitePersonName } from '@/lib/feed-data';
import { isAdmin } from '@/lib/session';
import { recordGalleryView } from '@/lib/views';
import { parseGalleryTheme } from '@/lib/gallery-theme';
import { coverObjectPosition } from '@/lib/cover-focus';
import GalleryThemeStyle from '@/components/GalleryThemeStyle';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const gallery = getDb()
    .select()
    .from(schema.galleries)
    .where(and(eq(schema.galleries.slug, slug), eq(schema.galleries.type, 'portfolio')))
    .get();
  if (!gallery || !gallery.published) return {};
  const seo = effectiveGallerySeo(gallery);
  const base: Metadata = {
    title: seo.title,
    description: seo.description,
    robots: seo.robots,
  };
  if (!gallery.socialPreview) return base;
  const preview = previewPhotoId(gallery);
  if (!preview) return base;
  const imageUrl = `${BASE_URL}/img/${preview}/web`;
  return {
    ...base,
    openGraph: {
      title: seo.title,
      description: seo.description,
      images: [{ url: imageUrl }],
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.title,
      description: seo.description,
      images: [imageUrl],
    },
  };
}

export default async function PortfolioGalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const admin = await isAdmin();
  const isPreview = preview === '1' && admin;

  const gallery = getDb()
    .select()
    .from(schema.galleries)
    .where(and(eq(schema.galleries.slug, slug), eq(schema.galleries.type, 'portfolio')))
    .get();
  if (!gallery) {
    const currentSlug = findCurrentSlugFor(slug);
    if (currentSlug) permanentRedirect(`/portfolio/${currentSlug}`);
    notFound();
  }
  if (!gallery.published && !isPreview) notFound();

  if (gallery.published) await recordGalleryView(gallery.id, null);

  const photos = getReadyPhotos(gallery.id);
  const sectionsDb = getDb()
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.galleryId, gallery.id))
    .orderBy(asc(schema.sections.sortOrder))
    .all();
  const sectionGroups = buildSectionPayloads(gallery, photos, sectionsDb);
  const cover = previewPhotoId(gallery);
  const theme = parseGalleryTheme(gallery.themeConfig);

  const titlePlacementClass = {
    center: 'items-center justify-center text-center',
    'bottom-left': 'items-end justify-start text-left',
    'bottom-center': 'items-end justify-center text-center',
  } as const;
  const titleSizeClass = {
    sm: 'text-2xl md:text-3xl',
    md: 'text-3xl md:text-5xl',
    lg: 'text-4xl md:text-6xl',
  } as const;

  return (
    <div data-gallery-theme={theme ? '' : undefined}>
      {theme && <GalleryThemeStyle theme={theme} />}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ImageGallery',
          name: gallery.title,
          author: { '@type': 'Person', name: sitePersonName() },
          ...(cover
            ? { image: `${BASE_URL}/img/${cover}/web` }
            : {}),
          url: `${BASE_URL}/portfolio/${gallery.slug}`,
        }}
      />
      <SiteHeader />
      {theme && cover && (
        <div
          className="relative w-full overflow-hidden"
          style={{ height: 'var(--gallery-cover-height)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/img/${cover}/web`}
            srcSet={`/img/${cover}/md 1280w, /img/${cover}/web 2000w`}
            sizes="100vw"
            alt={gallery.title}
            className="h-full w-full object-cover"
            style={{ objectPosition: coverObjectPosition(gallery.coverFocusX, gallery.coverFocusY) }}
          />
          <div className="absolute inset-0 bg-black" style={{ opacity: 'var(--gallery-cover-overlay)' }} />
          <div
            className={`absolute inset-0 flex p-6 sm:p-10 ${titlePlacementClass[theme.cover.titlePlacement]}`}
          >
            <h2
              className={`font-semibold text-white ${titleSizeClass[theme.cover.titleSize]}`}
              style={{ fontFamily: 'var(--gallery-font-heading)' }}
            >
              {gallery.title}
            </h2>
          </div>
        </div>
      )}
      <AdminEditLink href={`/admin/galleries/${gallery.id}`} label="Edit gallery" />
      <GalleryViewPing gallery={{ id: gallery.id, type: 'portfolio', title: gallery.title }} />
      <main className="mx-auto max-w-6xl px-6 pb-24">
        <h1 className="display pt-14 pb-3 text-center text-3xl font-semibold md:text-4xl">
          {gallery.title}
        </h1>
        {gallery.showLocation && gallery.locationName && (
          <p className="mb-8 text-center text-xs tracking-wide text-muted dark:text-muted-dark">
            {gallery.locationName}
            {gallery.locationLat && gallery.locationLng && (
              <>
                {' · '}
                <a
                  href={`https://www.openstreetmap.org/?mlat=${gallery.locationLat}&mlon=${gallery.locationLng}#map=14/${gallery.locationLat}/${gallery.locationLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  View on map
                </a>
              </>
            )}
          </p>
        )}
        <div className="mx-auto mb-12 h-px w-16 bg-line dark:bg-line-dark" />
        {sectionGroups.every((s) => s.photos.length === 0) ? (
          <p className="py-24 text-center text-sm text-muted dark:text-muted-dark">
            No photos yet.
          </p>
        ) : (
          <PortfolioGrid
            sections={sectionGroups}
            slug={gallery.slug}
            title={gallery.title}
            showLikeCounts={gallery.showLikeCounts}
            commentsEnabled={gallery.commentsMode !== 'off'}
            themed={!!theme}
          />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
