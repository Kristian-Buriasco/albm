import fs from 'node:fs';
import path from 'node:path';
import { asc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { detectImageType, resolveCollision, sanitizeFilename } from '@/lib/files';
import { originalPath } from '@/lib/paths';
import { extractExif } from '@/lib/exif';
import { enqueueDerivatives } from '@/lib/queue';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

/** Lightweight photo list, used by the admin UI for status polling. */
export async function GET(_req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const rows = getDb()
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.galleryId, id))
    .orderBy(asc(schema.photos.sortOrder))
    .all();
  return json(rows);
}

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
  if (!gallery) return errorJson('Gallery not found', 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorJson('Expected multipart form data', 400);
  }
  const file = form.get('file');
  if (!(file instanceof File)) return errorJson('Missing file', 400);
  if (file.size > MAX_UPLOAD_BYTES) return errorJson('File too large (max 50 MB)', 413);

  const buf = Buffer.from(await file.arrayBuffer());
  if (!detectImageType(buf)) {
    return errorJson('Only JPEG and PNG files are accepted', 415);
  }

  const sanitized = sanitizeFilename(file.name);
  if (!sanitized) return errorJson('Invalid filename', 400);

  const taken = new Set(
    db
      .select({ filename: schema.photos.filename })
      .from(schema.photos)
      .where(eq(schema.photos.galleryId, id))
      .all()
      .map((r) => r.filename),
  );
  const filename = resolveCollision(sanitized, (c) => taken.has(c));

  const sectionIdRaw = form.get('sectionId');
  let sectionId: string | null = null;
  if (typeof sectionIdRaw === 'string' && sectionIdRaw) {
    const sec = db
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.id, sectionIdRaw))
      .get();
    if (sec && sec.galleryId === id) sectionId = sec.id;
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
    return errorJson('Could not read image', 415);
  }

  const dest = originalPath(id, filename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);

  const maxOrder =
    db
      .select({ m: sql<number>`coalesce(max(${schema.photos.sortOrder}), 0)` })
      .from(schema.photos)
      .where(eq(schema.photos.galleryId, id))
      .get()?.m ?? 0;

  const photo = {
    id: nanoid(),
    galleryId: id,
    sectionId,
    filename,
    width,
    height,
    sizeBytes: buf.length,
    sortOrder: maxOrder + 1,
    status: 'processing' as const,
    exif: exifJson,
    capturedAt,
  };
  db.insert(schema.photos).values(photo).run();
  enqueueDerivatives(photo.id);

  const row = db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, photo.id))
    .get();
  return json(row, 201);
}
