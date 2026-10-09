import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { auditActor, errorJson, json, requireAdmin, requireGalleryCapability } from '@/lib/api';
import { deletePhotoById } from '@/lib/delete-photo';
import { logAdmin } from '@/lib/audit-log';
import { getPrincipal } from '@/lib/session';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  const updates: Partial<typeof schema.photos.$inferInsert> = {
    updatedAt: Date.now(),
  };
  if (typeof body.altText === 'string') {
    updates.altText = body.altText.trim().slice(0, 300) || null;
  }

  db.update(schema.photos).set(updates).where(eq(schema.photos.id, id)).run();
  const updated = db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, id))
    .get();
  return json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;

  const db = getDb();
  const photo = db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, id))
    .get();
  if (!photo) return errorJson('Not found', 404);

  const denied = await requireGalleryCapability(photo.galleryId, 'organize');
  if (denied) return denied;

  deletePhotoById(id);

  const gallery = db.select({ title: schema.galleries.title }).from(schema.galleries).where(eq(schema.galleries.id, photo.galleryId)).get();
  logAdmin('photo.delete', {
    targetType: 'gallery',
    targetId: photo.galleryId,
    summary: `Deleted photo "${photo.filename}" from "${gallery?.title ?? photo.galleryId}"`,
    ...auditActor(await getPrincipal()),
  });

  return json({ ok: true });
}
