import fs from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { getDb, schema } from '@/db';
import {
  mdPath,
  originalPath,
  printPath,
  thumbPath,
  webPath,
  workingJpegPath,
} from '@/lib/paths';
import { decodeRawToJpeg } from '@/lib/raw';
import { reprocessPhoto } from '@/lib/queue';

export const PRINT_LONG_EDGE = 3000;

export type DerivativeKind = 'thumb' | 'md' | 'web' | 'workingJpeg' | 'print';

export interface MissingPhoto {
  photoId: string;
  filename: string;
  missingKinds: DerivativeKind[];
}

export interface GalleryIntegrityReport {
  galleryId: string;
  title: string;
  total: number;
  missingCount: number;
  missing: MissingPhoto[];
}

export interface IntegritySummary {
  galleries: GalleryIntegrityReport[];
  totalPhotos: number;
  totalMissing: number;
}

/** Which derivative kinds must exist on disk for a ready photo. */
function expectedKinds(isRaw: boolean): DerivativeKind[] {
  return isRaw
    ? ['thumb', 'md', 'web', 'workingJpeg', 'print']
    : ['thumb', 'md', 'web'];
}

function derivativePath(
  kind: DerivativeKind,
  galleryId: string,
  filename: string,
): string {
  switch (kind) {
    case 'thumb':
      return thumbPath(galleryId, filename);
    case 'md':
      return mdPath(galleryId, filename);
    case 'web':
      return webPath(galleryId, filename);
    case 'workingJpeg':
      return workingJpegPath(galleryId, filename);
    case 'print':
      return printPath(galleryId, filename);
  }
}

/** Scan every `status='ready'` photo in every gallery for missing derivative files. */
export function scanIntegrity(): IntegritySummary {
  const db = getDb();
  const galleries = db
    .select({ id: schema.galleries.id, title: schema.galleries.title })
    .from(schema.galleries)
    .all();

  const reports: GalleryIntegrityReport[] = [];
  let totalPhotos = 0;
  let totalMissing = 0;

  for (const gallery of galleries) {
    const photos = db
      .select({
        id: schema.photos.id,
        filename: schema.photos.filename,
        isRaw: schema.photos.isRaw,
      })
      .from(schema.photos)
      .where(
        and(eq(schema.photos.galleryId, gallery.id), eq(schema.photos.status, 'ready')),
      )
      .all();

    const missing: MissingPhoto[] = [];
    for (const photo of photos) {
      const missingKinds: DerivativeKind[] = [];
      for (const kind of expectedKinds(photo.isRaw)) {
        const p = derivativePath(kind, gallery.id, photo.filename);
        if (!fs.existsSync(p)) missingKinds.push(kind);
      }
      if (missingKinds.length > 0) {
        missing.push({ photoId: photo.id, filename: photo.filename, missingKinds });
      }
    }

    totalPhotos += photos.length;
    totalMissing += missing.length;

    reports.push({
      galleryId: gallery.id,
      title: gallery.title,
      total: photos.length,
      missingCount: missing.length,
      missing,
    });
  }

  return { galleries: reports, totalPhotos, totalMissing };
}

async function regenerateWorkingJpeg(
  galleryId: string,
  filename: string,
): Promise<boolean> {
  const src = originalPath(galleryId, filename);
  if (!fs.existsSync(src)) return false;
  const buf = fs.readFileSync(src);
  const jpeg = await decodeRawToJpeg(buf);
  if (!jpeg) return false;
  const out = workingJpegPath(galleryId, filename);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, jpeg);
  return true;
}

/**
 * Regenerate the `print` derivative the same way the download pipeline lazily
 * builds it (see `ensurePrintDerivative` in `src/lib/download-delivery.ts`) —
 * kept in sync manually since that helper isn't exported.
 */
async function regeneratePrint(
  galleryId: string,
  filename: string,
  isRaw: boolean,
): Promise<boolean> {
  const src = isRaw ? workingJpegPath(galleryId, filename) : originalPath(galleryId, filename);
  if (!fs.existsSync(src)) return false;
  const out = printPath(galleryId, filename);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(src)
    .rotate()
    .resize(PRINT_LONG_EDGE, PRINT_LONG_EDGE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(out);
  return true;
}

export interface RegenerateResult {
  photoId: string;
  ok: boolean;
  regenerated: DerivativeKind[];
  failed: DerivativeKind[];
}

/**
 * Rebuild whichever derivatives are missing for a single photo. thumb/md/web
 * (and the placeholder) are rebuilt via the shared derivative queue pipeline
 * (`reprocessPhoto`, `src/lib/queue.ts`) so they stay byte-identical to the
 * normal upload path. `workingJpeg` (RAW only) is re-decoded from the RAW
 * original, and `print` is rebuilt the same way the download pipeline does.
 */
export async function regeneratePhotoDerivatives(
  photoId: string,
): Promise<RegenerateResult> {
  const db = getDb();
  const photo = db.select().from(schema.photos).where(eq(schema.photos.id, photoId)).get();
  if (!photo) return { photoId, ok: false, regenerated: [], failed: [] };

  const missingKinds: DerivativeKind[] = [];
  for (const kind of expectedKinds(photo.isRaw)) {
    if (!fs.existsSync(derivativePath(kind, photo.galleryId, photo.filename))) {
      missingKinds.push(kind);
    }
  }

  const regenerated: DerivativeKind[] = [];
  const failed: DerivativeKind[] = [];

  if (
    missingKinds.includes('thumb') ||
    missingKinds.includes('md') ||
    missingKinds.includes('web')
  ) {
    // Fire-and-forget: rejoins the normal background derivative queue.
    reprocessPhoto(photoId);
    for (const k of ['thumb', 'md', 'web'] as const) {
      if (missingKinds.includes(k)) regenerated.push(k);
    }
  }

  if (missingKinds.includes('workingJpeg')) {
    try {
      const ok = await regenerateWorkingJpeg(photo.galleryId, photo.filename);
      (ok ? regenerated : failed).push('workingJpeg');
    } catch {
      failed.push('workingJpeg');
    }
  }

  if (missingKinds.includes('print')) {
    try {
      const ok = await regeneratePrint(photo.galleryId, photo.filename, photo.isRaw);
      (ok ? regenerated : failed).push('print');
    } catch {
      failed.push('print');
    }
  }

  return { photoId, ok: failed.length === 0, regenerated, failed };
}

export interface RegenerateGalleryResult {
  galleryId: string;
  attempted: number;
  results: RegenerateResult[];
}

/** Regenerate derivatives for every photo in a gallery that has any missing. */
export async function regenerateGalleryDerivatives(
  galleryId: string,
): Promise<RegenerateGalleryResult> {
  const db = getDb();
  const photos = db
    .select({ id: schema.photos.id, filename: schema.photos.filename, isRaw: schema.photos.isRaw })
    .from(schema.photos)
    .where(
      and(eq(schema.photos.galleryId, galleryId), eq(schema.photos.status, 'ready')),
    )
    .all();

  const results: RegenerateResult[] = [];
  for (const photo of photos) {
    const missing = expectedKinds(photo.isRaw).some(
      (kind) => !fs.existsSync(derivativePath(kind, galleryId, photo.filename)),
    );
    if (missing) {
      results.push(await regeneratePhotoDerivatives(photo.id));
    }
  }

  return { galleryId, attempted: results.length, results };
}
