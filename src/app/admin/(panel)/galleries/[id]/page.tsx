import { notFound } from 'next/navigation';
import { asc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { dirSizeBytes } from '@/lib/disk';
import { galleryDir } from '@/lib/paths';
import { BASE_URL } from '@/lib/env';
import GalleryAdmin from './GalleryAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminGalleryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, id))
    .get();
  if (!gallery) notFound();

  const photos = db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.galleryId, id))
    .orderBy(asc(schema.photos.sortOrder))
    .all();

  const visitors = db
    .select()
    .from(schema.visitors)
    .where(eq(schema.visitors.galleryId, id))
    .orderBy(asc(schema.visitors.createdAt))
    .all();

  const selections =
    photos.length > 0
      ? db
          .select({
            photoId: schema.selections.photoId,
            visitorId: schema.selections.visitorId,
          })
          .from(schema.selections)
          .where(
            inArray(
              schema.selections.photoId,
              photos.map((p) => p.id),
            ),
          )
          .all()
      : [];

  return (
    <GalleryAdmin
      gallery={gallery}
      initialPhotos={photos}
      visitors={visitors.map((v) => ({ id: v.id, name: v.name, email: v.email }))}
      selections={selections}
      sizeBytes={dirSizeBytes(galleryDir(id))}
      shareUrl={`${BASE_URL}/g/${gallery.slug}`}
    />
  );
}
