import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { isGalleryExpired } from '@/lib/downloads';
import { galleryDir, originalPath, thumbPath, webPath } from '@/lib/paths';
import { logAdmin } from '@/lib/audit-log';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, id))
    .get();
  if (!gallery) return errorJson('Not found', 404);
  if (gallery.type !== 'client' || !isGalleryExpired(gallery)) {
    return errorJson('Only expired client galleries can be cleaned up', 400);
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  const action = body.action;
  if (action === 'unpublish') {
    db.update(schema.galleries)
      .set({ published: false, updatedAt: Date.now() })
      .where(eq(schema.galleries.id, id))
      .run();
    logAdmin('gallery.cleanup.unpublish', {
      targetType: 'gallery',
      targetId: id,
      summary: `Unpublished expired gallery "${gallery.title}"`,
    });
    return json({ ok: true, action });
  }

  if (action === 'delete-photos') {
    const photos = db
      .select()
      .from(schema.photos)
      .where(eq(schema.photos.galleryId, id))
      .all();
    for (const p of photos) {
      for (const path of [
        originalPath(id, p.filename),
        webPath(id, p.filename),
        thumbPath(id, p.filename),
      ]) {
        fs.rmSync(path, { force: true });
      }
    }
    logAdmin('gallery.cleanup.delete-photos', {
      targetType: 'gallery',
      targetId: id,
      summary: `Deleted photo files from expired gallery "${gallery.title}" (${photos.length} photos)`,
    });
    return json({ ok: true, action, removed: photos.length });
  }

  if (action === 'delete') {
    db.delete(schema.galleries).where(eq(schema.galleries.id, id)).run();
    fs.rmSync(galleryDir(id), { recursive: true, force: true });
    logAdmin('gallery.cleanup.delete', {
      targetType: 'gallery',
      targetId: id,
      summary: `Deleted expired gallery "${gallery.title}" via cleanup`,
    });
    return json({ ok: true, action });
  }

  return errorJson('Unknown action', 400);
}
