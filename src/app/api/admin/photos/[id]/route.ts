import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { originalPath, thumbPath, webPath } from '@/lib/paths';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const db = getDb();
  const photo = db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, id))
    .get();
  if (!photo) return errorJson('Not found', 404);

  db.delete(schema.photos).where(eq(schema.photos.id, id)).run();

  // Clear cover reference if this photo was the gallery cover.
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

  return json({ ok: true });
}
