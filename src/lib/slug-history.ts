import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';

export function recordSlugChange(galleryId: string, oldSlug: string): void {
  getDb()
    .insert(schema.gallerySlugHistory)
    .values({ id: nanoid(), galleryId, oldSlug })
    .run();
}

/** Current live slug for a gallery that used to be known by `oldSlug`, or null. */
export function findCurrentSlugFor(oldSlug: string): string | null {
  const db = getDb();
  const entry = db
    .select({ galleryId: schema.gallerySlugHistory.galleryId })
    .from(schema.gallerySlugHistory)
    .where(eq(schema.gallerySlugHistory.oldSlug, oldSlug))
    .get();
  if (!entry) return null;

  const gallery = db
    .select({ slug: schema.galleries.slug })
    .from(schema.galleries)
    .where(eq(schema.galleries.id, entry.galleryId))
    .get();
  return gallery?.slug ?? null;
}
