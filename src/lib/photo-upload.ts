import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { getDb, schema } from '@/db';
import { detectImageType, detectUploadKind, resolveCollision, sanitizeFilename } from '@/lib/files';
import { originalPath, workingJpegPath } from '@/lib/paths';
import { extractExif } from '@/lib/exif';
import { enqueueDerivatives } from '@/lib/queue';
import {
  decodeRawToJpeg,
  isRawFilename,
  MAX_RAW_UPLOAD_BYTES,
  rawFormatFromFilename,
} from '@/lib/raw';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type UploadPhotoResult =
  | { ok: true; photo: typeof schema.photos.$inferSelect; created: true }
  | { ok: true; duplicate: true; existingFilename: string; created: false }
  | { ok: false; status: number; error: string };

export type IngestOptions = {
  /** When true and gallery.autoPublishOnUpload, publish the gallery if still draft. */
  fromPublishApi?: boolean;
};

/** Shared ingest pipeline for admin + external publish API. */
export async function ingestGalleryPhoto(
  galleryId: string,
  file: File,
  sectionId?: string | null,
  opts: IngestOptions = {},
): Promise<UploadPhotoResult> {
  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, galleryId))
    .get();
  if (!gallery) return { ok: false, status: 404, error: 'Gallery not found' };

  const sanitized = sanitizeFilename(file.name);
  if (!sanitized) return { ok: false, status: 400, error: 'Invalid filename' };

  const isRaw = isRawFilename(sanitized);
  const maxBytes = isRaw ? MAX_RAW_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  if (file.size > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: isRaw
        ? 'File too large (max 100 MB for RAW)'
        : 'File too large (max 50 MB)',
    };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const kind = detectUploadKind(buf, sanitized);
  if (!kind) {
    return {
      ok: false,
      status: 415,
      error: 'Only JPEG, PNG, and camera RAW (DNG/CR2/CR3/NEF/ARW/…) files are accepted',
    };
  }

  let workingJpeg: Buffer | null = null;
  let isRawPhoto = false;
  let format: string | null = null;

  if (kind === 'raw') {
    isRawPhoto = true;
    format = rawFormatFromFilename(sanitized);
    workingJpeg = await decodeRawToJpeg(buf);
    if (!workingJpeg) {
      return {
        ok: false,
        status: 415,
        error:
          'Could not decode this RAW file. Upload a JPEG/PNG, or a RAW with an embedded preview (or install dcraw on the server).',
      };
    }
  } else {
    format = kind;
    if (!detectImageType(buf)) {
      return { ok: false, status: 415, error: 'Only JPEG and PNG files are accepted' };
    }
  }

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

  const metaSource = workingJpeg ?? buf;
  let width = 0;
  let height = 0;
  let exifJson: string | null = null;
  let capturedAt: number | null = null;
  try {
    const meta = await sharp(metaSource).metadata();
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

  if (workingJpeg) {
    const wp = workingJpegPath(galleryId, filename);
    fs.mkdirSync(path.dirname(wp), { recursive: true });
    fs.writeFileSync(wp, workingJpeg);
  }

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
    isRaw: isRawPhoto,
    format,
  };
  db.insert(schema.photos).values(photo).run();
  enqueueDerivatives(photo.id);

  if (opts.fromPublishApi && gallery.autoPublishOnUpload && !gallery.published) {
    db.update(schema.galleries)
      .set({ published: true, updatedAt: Date.now() })
      .where(eq(schema.galleries.id, galleryId))
      .run();
  }

  const row = db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, photo.id))
    .get()!;
  return { ok: true, photo: row, created: true };
}
