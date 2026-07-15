import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import SiteHeader from '@/components/SiteHeader';
import PortfolioGrid from '@/components/PortfolioGrid';
import { BASE_URL } from '@/lib/env';
import { buildSectionPayloads } from '@/lib/gallery-page-data';
import { coverPhotoId, getReadyPhotos } from '@/lib/public-data';
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
  if (!gallery || !gallery.published || !gallery.socialPreview) return {};
  const cover = coverPhotoId(gallery);
  if (!cover) return { title: gallery.title };
  const imageUrl = `${BASE_URL}/img/${cover}/web`;
  return {
    title: gallery.title,
    openGraph: {
      title: gallery.title,
      images: [{ url: imageUrl }],
    },
    twitter: {
      card: 'summary_large_image',
      title: gallery.title,
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

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pb-24">
        <h1 className="pt-12 pb-3 text-center font-serif text-4xl font-medium tracking-tight md:text-5xl">
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
    </div>
  );
}
