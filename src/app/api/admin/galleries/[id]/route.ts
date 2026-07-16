import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { parseGalleryUpdates } from '@/lib/gallery-fields';
import { galleryDir } from '@/lib/paths';
import { hashPin, isValidPinFormat } from '@/lib/pin';
import { reprocessPhoto, shouldReprocessWatermark } from '@/lib/queue';
import { logAdmin } from '@/lib/audit-log';

type Params = { params: Promise<{ id: string }> };

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
  return json(gallery);
}

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

  if ('pin' in body) {
    if (body.pin === null || body.pin === '') {
      updates.pinHash = null;
    } else if (typeof body.pin === 'string' && body.pin.length > 0) {
      if (!isValidPinFormat(body.pin)) {
        return errorJson('PIN must be 6 digits', 400);
      }
      updates.pinHash = await hashPin(body.pin);
    }
  }

  const needsReprocess = shouldReprocessWatermark(updates);

  updates.updatedAt = Date.now();
  db.update(schema.galleries).set(updates).where(eq(schema.galleries.id, id)).run();

  if ('published' in body && typeof body.published === 'boolean') {
    logAdmin(body.published ? 'gallery.publish' : 'gallery.unpublish', {
      targetType: 'gallery',
      targetId: id,
      summary: `${body.published ? 'Published' : 'Unpublished'} gallery "${gallery.title}"`,
    });
  }
  if ('password' in body) {
    const cleared =
      body.password === null ||
      body.password === '' ||
      (typeof body.password === 'string' && body.password.length === 0);
    logAdmin(cleared ? 'gallery.password.clear' : 'gallery.password.set', {
      targetType: 'gallery',
      targetId: id,
      summary: `${cleared ? 'Cleared' : 'Set'} password for "${gallery.title}"`,
    });
  }
  if ('pin' in body) {
    const cleared = body.pin === null || body.pin === '';
    logAdmin(cleared ? 'gallery.pin.clear' : 'gallery.pin.set', {
      targetType: 'gallery',
      targetId: id,
      summary: `${cleared ? 'Cleared' : 'Set'} PIN for "${gallery.title}"`,
    });
  }
  if ('pinEnabled' in body && typeof body.pinEnabled === 'boolean') {
    logAdmin('gallery.pin.toggle', {
      targetType: 'gallery',
      targetId: id,
      summary: `PIN access ${body.pinEnabled ? 'enabled' : 'disabled'} for "${gallery.title}"`,
    });
  }
  if ('forensicWatermark' in body && typeof body.forensicWatermark === 'boolean') {
    logAdmin(
      body.forensicWatermark ? 'gallery.forensic.enable' : 'gallery.forensic.disable',
      {
        targetType: 'gallery',
        targetId: id,
        summary: `Forensic watermark ${body.forensicWatermark ? 'enabled' : 'disabled'} for "${gallery.title}"`,
      },
    );
  }
  if ('autoPublishOnUpload' in body && typeof body.autoPublishOnUpload === 'boolean') {
    logAdmin('gallery.auto_publish.toggle', {
      targetType: 'gallery',
      targetId: id,
      summary: `Auto-publish on upload ${body.autoPublishOnUpload ? 'enabled' : 'disabled'} for "${gallery.title}"`,
    });
  }

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

  logAdmin('gallery.delete', {
    targetType: 'gallery',
    targetId: id,
    summary: `Deleted gallery "${gallery.title}"`,
  });

  return json({ ok: true });
}
