import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { mdPath, originalPath, printPath, thumbPath, webPath, workingJpegPath } from './paths';

export function deletePhotoById(id: string): boolean {
  const db = getDb();
  const photo = db.select().from(schema.photos).where(eq(schema.photos.id, id)).get();
  if (!photo) return false;

  db.delete(schema.photos).where(eq(schema.photos.id, id)).run();
  db.update(schema.galleries)
    .set({ coverPhotoId: null, updatedAt: Date.now() })
    .where(eq(schema.galleries.coverPhotoId, id))
    .run();
  db.update(schema.galleries)
    .set({ previewPhotoId: null, updatedAt: Date.now() })
    .where(eq(schema.galleries.previewPhotoId, id))
    .run();

  // Every file this photo ever produced: the upload, the working JPEG decoded from a RAW,
  // and all generated sizes (including the 1280px and print copies, which used to be
  // left behind as orphans after a "delete").
  for (const p of [
    originalPath(photo.galleryId, photo.filename),
    workingJpegPath(photo.galleryId, photo.filename),
    printPath(photo.galleryId, photo.filename),
    webPath(photo.galleryId, photo.filename),
    mdPath(photo.galleryId, photo.filename),
    thumbPath(photo.galleryId, photo.filename),
  ]) {
    fs.rmSync(p, { force: true });
  }
  return true;
}
