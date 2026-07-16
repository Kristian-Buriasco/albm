import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { getDb, schema } from '@/db';
import { detectImageType, resolveCollision, sanitizeFilename } from '@/lib/files';
import { originalPath } from '@/lib/paths';
import { extractExif } from '@/lib/exif';
import { enqueueDerivatives } from '@/lib/queue';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type UploadPhotoResult =
  | { ok: true; photo: typeof schema.photos.$inferSelect; created: true }
  | { ok: true; duplicate: true; existingFilename: string; created: false }
  | { ok: false; status: number; error: string };

/** Shared ingest pipeline for admin + external publish API. */
export async function ingestGalleryPhoto(
  galleryId: string,
  file: File,
  sectionId?: string | null,
): Promise<UploadPhotoResult> {
  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, galleryId))
    .get();
  if (!gallery) return { ok: false, status: 404, error: 'Gallery not found' };

  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, error: 'File too large (max 50 MB)' };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (!detectImageType(buf)) {
    return { ok: false, status: 415, error: 'Only JPEG and PNG files are accepted' };
  }

  const sanitized = sanitizeFilename(file.name);
  if (!sanitized) return { ok: false, status: 400, error: 'Invalid filename' };

  const contentHash = crypto.createHash('sha256').update(buf).digest('hex');
  const duplicate = db
    .select({ filename: schema.photos.filename })
    .from(schema.photos)
    .where(
      and(
        eq(schema.photos.galleryId, galleryId),
        eq(schema.photos.contentHash, contentHash),
      ),
    )
    .get();
  if (duplicate) {
    return { ok: true, duplicate: true, existingFilename: duplicate.filename, created: false };
  }

  const taken = new Set(
    db
      .select({ filename: schema.photos.filename })
      .from(schema.photos)
      .where(eq(schema.photos.galleryId, galleryId))
      .all()
      .map((r) => r.filename),
  );
  const filename = resolveCollision(sanitized, (c) => taken.has(c));

  let resolvedSectionId: string | null = null;
  if (sectionId) {
    const sec = db
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.id, sectionId))
      .get();
    if (sec && sec.galleryId === galleryId) resolvedSectionId = sec.id;
  }

  let width = 0;
  let height = 0;
  let exifJson: string | null = null;
  let capturedAt: number | null = null;
  try {
    const meta = await sharp(buf).metadata();
    const swap = (meta.orientation ?? 1) >= 5;
    width = (swap ? meta.height : meta.width) ?? 0;
    height = (swap ? meta.width : meta.height) ?? 0;
    const extracted = extractExif(meta);
    exifJson = extracted.exif ? JSON.stringify(extracted.exif) : null;
    capturedAt = extracted.capturedAt;
  } catch {
    return { ok: false, status: 415, error: 'Could not read image' };
  }

  const dest = originalPath(galleryId, filename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);

  const maxOrder =
    db
      .select({ m: sql<number>`coalesce(max(${schema.photos.sortOrder}), 0)` })
      .from(schema.photos)
      .where(eq(schema.photos.galleryId, galleryId))
      .get()?.m ?? 0;

  const photo = {
    id: nanoid(),
    galleryId,
    sectionId: resolvedSectionId,
    filename,
    width,
    height,
    sizeBytes: buf.length,
    sortOrder: maxOrder + 1,
    status: 'processing' as const,
    exif: exifJson,
    capturedAt,
    contentHash,
  };
  db.insert(schema.photos).values(photo).run();
  enqueueDerivatives(photo.id);

  const row = db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, photo.id))
    .get()!;
  return { ok: true, photo: row, created: true };
}
