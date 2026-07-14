import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { parseGalleryUpdates } from '@/lib/gallery-fields';
import { galleryDir } from '@/lib/paths';
import { reprocessPhoto, shouldReprocessWatermark } from '@/lib/queue';

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

  const updates = parseGalleryUpdates(body);

  if ('password' in body) {
    if (typeof body.password === 'string' && body.password.length > 0) {
      updates.passwordHash = await bcrypt.hash(body.password, 10);
    } else {
      updates.passwordHash = null;
    }
  }

  const needsReprocess = shouldReprocessWatermark(updates);

  updates.updatedAt = Date.now();
  db.update(schema.galleries).set(updates).where(eq(schema.galleries.id, id)).run();

  if (needsReprocess) {
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
