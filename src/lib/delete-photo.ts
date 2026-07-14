import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { originalPath, thumbPath, webPath } from './paths';

export function deletePhotoById(id: string): boolean {
  const db = getDb();
  const photo = db.select().from(schema.photos).where(eq(schema.photos.id, id)).get();
  if (!photo) return false;

  db.delete(schema.photos).where(eq(schema.photos.id, id)).run();
  db.update(schema.galleries)
    .set({ coverPhotoId: null, updatedAt: Date.now() })
    .where(eq(schema.galleries.coverPhotoId, id))
    .run();

  for (const p of [
    originalPath(photo.galleryId, photo.filename),
    webPath(photo.galleryId, photo.filename),
    thumbPath(photo.galleryId, photo.filename),
  ]) {
    fs.rmSync(p, { force: true });
  }
  return true;
}
