import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { galleryDir } from '@/lib/paths';
import { reprocessPhoto } from '@/lib/queue';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  const updates: Partial<typeof schema.galleries.$inferInsert> = {};

  if (typeof body.title === 'string' && body.title.trim()) {
    updates.title = body.title.trim();
  }
  if ('eventDate' in body) {
    updates.eventDate =
      typeof body.eventDate === 'number' ? body.eventDate : null;
  }
  if ('password' in body) {
    // null/empty clears the password; a non-empty string sets a new one.
    if (typeof body.password === 'string' && body.password.length > 0) {
      updates.passwordHash = await bcrypt.hash(body.password, 10);
    } else {
      updates.passwordHash = null;
    }
  }
  if (
    body.clientInfoMode === 'off' ||
    body.clientInfoMode === 'optional' ||
    body.clientInfoMode === 'required'
  ) {
    updates.clientInfoMode = body.clientInfoMode;
  }
  for (const key of [
    'watermarkEnabled',
    'downloadEnabled',
    'selectionExportEnabled',
    'published',
  ] as const) {
    if (typeof body[key] === 'boolean') updates[key] = body[key];
  }
  if ('coverPhotoId' in body) {
    updates.coverPhotoId =
      typeof body.coverPhotoId === 'string' ? body.coverPhotoId : null;
  }
  if (typeof body.sortOrder === 'number') updates.sortOrder = body.sortOrder;

  const watermarkChanged =
    'watermarkEnabled' in updates &&
    updates.watermarkEnabled !== gallery.watermarkEnabled;

  updates.updatedAt = Date.now();
  db.update(schema.galleries).set(updates).where(eq(schema.galleries.id, id)).run();

  // Toggling the watermark invalidates web derivatives; reprocess everything.
  if (watermarkChanged) {
    const photoRows = db
      .select({ id: schema.photos.id })
      .from(schema.photos)
      .where(eq(schema.photos.galleryId, id))
      .all();
    for (const p of photoRows) reprocessPhoto(p.id);
  }

  const updated = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, id))
    .get();
  return json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
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

  db.delete(schema.galleries).where(eq(schema.galleries.id, id)).run();
  fs.rmSync(galleryDir(id), { recursive: true, force: true });

  return json({ ok: true });
}
