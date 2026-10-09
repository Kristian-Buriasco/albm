import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';

const TAG_NAME_MAX = 40;

export function normalizeTagName(name: string): string {
  return name.trim().slice(0, TAG_NAME_MAX);
}

export function listTags(): { id: string; name: string }[] {
  return getDb()
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.tags)
    .orderBy(asc(schema.tags.name))
    .all();
}

export function findTagByName(name: string): { id: string; name: string } | undefined {
  const normalized = normalizeTagName(name);
  if (!normalized) return undefined;
  return getDb()
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.tags)
    .where(sql`lower(${schema.tags.name}) = lower(${normalized})`)
    .get();
}

export function createTag(name: string): { id: string; name: string } {
  const normalized = normalizeTagName(name);
  if (!normalized) throw new Error('Tag name required');
  const existing = findTagByName(normalized);
  if (existing) return existing;
  const row = { id: nanoid(), name: normalized };
  getDb().insert(schema.tags).values(row).run();
  return row;
}

export function deleteTag(id: string): void {
  getDb().delete(schema.tags).where(eq(schema.tags.id, id)).run();
}

export function tagExists(id: string): boolean {
  return !!getDb()
    .select({ id: schema.tags.id })
    .from(schema.tags)
    .where(eq(schema.tags.id, id))
    .get();
}

export function getPhotoTagsForGallery(
  galleryId: string,
): Record<string, { id: string; name: string }[]> {
  const rows = getDb()
    .select({
      photoId: schema.photoTags.photoId,
      tagId: schema.tags.id,
      tagName: schema.tags.name,
    })
    .from(schema.photoTags)
    .innerJoin(schema.tags, eq(schema.photoTags.tagId, schema.tags.id))
    .innerJoin(schema.photos, eq(schema.photoTags.photoId, schema.photos.id))
    .where(eq(schema.photos.galleryId, galleryId))
    // Without an explicit order SQLite returns rows by the primary-key index, i.e. sorted by
    // the tag's random id — so tags appeared in an arbitrary order. rowid = insertion order.
    .orderBy(sql`"photo_tags"."rowid"`)
    .all();

  const map: Record<string, { id: string; name: string }[]> = {};
  for (const row of rows) {
    (map[row.photoId] ??= []).push({ id: row.tagId, name: row.tagName });
  }
  return map;
}

export function getGalleryTags(galleryId: string): { id: string; name: string }[] {
  return getDb()
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.galleryTags)
    .innerJoin(schema.tags, eq(schema.galleryTags.tagId, schema.tags.id))
    .where(eq(schema.galleryTags.galleryId, galleryId))
    .orderBy(asc(schema.tags.name))
    .all();
}

export function getDistinctPhotoTagsInGallery(
  galleryId: string,
): { id: string; name: string }[] {
  return getDb()
    .selectDistinct({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.photoTags)
    .innerJoin(schema.tags, eq(schema.photoTags.tagId, schema.tags.id))
    .innerJoin(schema.photos, eq(schema.photoTags.photoId, schema.photos.id))
    .where(eq(schema.photos.galleryId, galleryId))
    .orderBy(asc(schema.tags.name))
    .all();
}

export function assignTagToPhotos(photoIds: string[], tagId: string): void {
  const db = getDb();
  for (const photoId of photoIds) {
    db.insert(schema.photoTags)
      .values({ photoId, tagId })
      .onConflictDoNothing()
      .run();
  }
}

export function unassignTagFromPhotos(photoIds: string[], tagId: string): void {
  if (photoIds.length === 0) return;
  getDb()
    .delete(schema.photoTags)
    .where(
      and(
        eq(schema.photoTags.tagId, tagId),
        inArray(schema.photoTags.photoId, photoIds),
      ),
    )
    .run();
}

export function assignTagToGallery(galleryId: string, tagId: string): void {
  getDb()
    .insert(schema.galleryTags)
    .values({ galleryId, tagId })
    .onConflictDoNothing()
    .run();
}

export function unassignTagFromGallery(galleryId: string, tagId: string): void {
  getDb()
    .delete(schema.galleryTags)
    .where(
      and(
        eq(schema.galleryTags.galleryId, galleryId),
        eq(schema.galleryTags.tagId, tagId),
      ),
    )
    .run();
}

export function getDistinctPhotoTagsForClientGallery(
  galleryId: string,
): { id: string; name: string }[] {
  return getDistinctPhotoTagsInGallery(galleryId);
}

export function getPhotoTagMapForClient(
  galleryId: string,
): Record<string, string[]> {
  const rows = getDb()
    .select({
      photoId: schema.photoTags.photoId,
      tagId: schema.tags.id,
    })
    .from(schema.photoTags)
    .innerJoin(schema.tags, eq(schema.photoTags.tagId, schema.tags.id))
    .innerJoin(schema.photos, eq(schema.photoTags.photoId, schema.photos.id))
    .where(eq(schema.photos.galleryId, galleryId))
    .all();

  const map: Record<string, string[]> = {};
  for (const row of rows) {
    (map[row.photoId] ??= []).push(row.tagId);
  }
  return map;
}
