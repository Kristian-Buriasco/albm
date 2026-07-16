import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { getGalleryFaceCount, purgeGalleryFaces, startFaceBatch } from '@/lib/face-search';
import { logAdmin } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** GET face-batch progress + face count. */
export async function GET(_req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const gallery = getDb()
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, id))
    .get();
  if (!gallery) return errorJson('Not found', 404);
  return json({
    faceSearch: gallery.faceSearch,
    status: gallery.faceBatchStatus,
    done: gallery.faceBatchDone,
    total: gallery.faceBatchTotal,
    error: gallery.faceBatchError,
    updatedAt: gallery.faceBatchUpdatedAt,
    faceCount: getGalleryFaceCount(id),
  });
}

/** POST starts embedding batch (explicit, not real-time). */
export async function POST(_req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const result = startFaceBatch(id);
  if (!result.ok) return errorJson(result.error, 400);
  return json({ ok: true });
}

/** DELETE purges all face embeddings for the gallery (GDPR). */
export async function DELETE(_req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const gallery = getDb()
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, id))
    .get();
  if (!gallery) return errorJson('Not found', 404);
  const removed = purgeGalleryFaces(id);
  logAdmin('gallery.face_purge', {
    targetType: 'gallery',
    targetId: id,
    summary: `Purged ${removed} face embedding(s) for "${gallery.title}"`,
  });
  return json({ removed });
}
