import { and, asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';

export function getPublishedPortfolioGalleries() {
  return getDb()
    .select()
    .from(schema.galleries)
    .where(
      and(
        eq(schema.galleries.type, 'portfolio'),
        eq(schema.galleries.published, true),
      ),
    )
    .orderBy(asc(schema.galleries.sortOrder), asc(schema.galleries.createdAt))
    .all();
}

/** Selected Work: featured portfolios, or all if none featured. */
export function getSelectedWorkGalleries() {
  // Only explicitly-featured galleries. If none are featured, the homepage
  // shows no "Selected Work" section at all (the caller checks length).
  return getPublishedPortfolioGalleries().filter((g) => g.featured);
}

export function getReadyPhotos(galleryId: string) {
  return getDb()
    .select()
    .from(schema.photos)
    .where(
      and(
        eq(schema.photos.galleryId, galleryId),
        eq(schema.photos.status, 'ready'),
      ),
    )
    .orderBy(asc(schema.photos.sortOrder))
    .all();
}

/** Cover photo id for a gallery: explicit cover, else first ready photo. */
export function coverPhotoId(gallery: {
  id: string;
  coverPhotoId: string | null;
}): string | null {
  if (gallery.coverPhotoId) return gallery.coverPhotoId;
  const first = getReadyPhotos(gallery.id)[0];
  return first?.id ?? null;
}

/** Photo id used for the link/OG preview: explicit preview, else cover. */
export function previewPhotoId(gallery: {
  id: string;
  coverPhotoId: string | null;
  previewPhotoId: string | null;
}): string | null {
  if (gallery.previewPhotoId) return gallery.previewPhotoId;
  return coverPhotoId(gallery);
}
