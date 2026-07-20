import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import AdminEditLink from '@/components/AdminEditLink';
import PortfolioGrid from '@/components/PortfolioGrid';
import JsonLd from '@/components/JsonLd';
import { BASE_URL } from '@/lib/env';
import { buildSectionPayloads } from '@/lib/gallery-page-data';
import { previewPhotoId, getReadyPhotos } from '@/lib/public-data';
import { effectiveGallerySeo } from '@/lib/gallery-seo';
import { sitePersonName } from '@/lib/feed-data';
import { isAdmin } from '@/lib/session';
import { recordGalleryView } from '@/lib/views';

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
  if (!gallery || (!gallery.published && !isPreview)) notFound();

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

  return (
    <div>
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
      <AdminEditLink href={`/admin/galleries/${gallery.id}`} label="Edit gallery" />
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
            showLikeCounts={gallery.showLikeCounts}
            commentsEnabled={gallery.commentsMode !== 'off'}
          />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
