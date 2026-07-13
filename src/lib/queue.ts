import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import PQueue from 'p-queue';
import sharp from 'sharp';
import { getDb, schema } from '@/db';
import { thumbPath, watermarkPath, webPath, originalPath } from './paths';

// Low-memory sharp configuration for the 2 GB production host.
sharp.cache(false);
sharp.concurrency(1);

const globalForQueue = globalThis as unknown as {
  __derivativeQueue?: PQueue;
  __bootRecoveryDone?: boolean;
};

function getQueue(): PQueue {
  return (globalForQueue.__derivativeQueue ??= new PQueue({ concurrency: 1 }));
}

async function generateDerivatives(photoId: string): Promise<void> {
  const db = getDb();
  const photo = db.select().from(schema.photos).where(eq(schema.photos.id, photoId)).get();
  if (!photo) return; // deleted while queued
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, photo.galleryId))
    .get();
  if (!gallery) return;

  const src = originalPath(photo.galleryId, photo.filename);
  const webOut = webPath(photo.galleryId, photo.filename);
  const thumbOut = thumbPath(photo.galleryId, photo.filename);

  try {
    fs.mkdirSync(path.dirname(webOut), { recursive: true });
    fs.mkdirSync(path.dirname(thumbOut), { recursive: true });

    // Web derivative: long edge 2048, no enlargement, webp q82,
    // optional watermark composited bottom-right at ~25% width, ~70% opacity.
    const resized = sharp(src).rotate().resize(2048, 2048, {
      fit: 'inside',
      withoutEnlargement: true,
    });

    const wmPath = watermarkPath();
    if (gallery.watermarkEnabled && fs.existsSync(wmPath)) {
      const resizedBuf = await resized.toBuffer();
      const meta = await sharp(resizedBuf).metadata();
      const imgW = meta.width ?? 2048;
      const imgH = meta.height ?? 2048;
      const targetW = Math.max(1, Math.round(imgW * 0.25));
      const pad = Math.max(8, Math.round(imgW * 0.02));
      // Resize the watermark and reduce its alpha to ~70%.
      const wm = await sharp(wmPath)
        .resize(targetW, undefined, { fit: 'inside', withoutEnlargement: true })
        .ensureAlpha()
        .composite([
          {
            input: Buffer.from([255, 255, 255, Math.round(0.7 * 255)]),
            raw: { width: 1, height: 1, channels: 4 },
            tile: true,
            blend: 'dest-in',
          },
        ])
        .png()
        .toBuffer();
      const wmMeta = await sharp(wm).metadata();
      await sharp(resizedBuf)
        .composite([
          {
            input: wm,
            left: Math.max(0, imgW - (wmMeta.width ?? 0) - pad),
            top: Math.max(0, imgH - (wmMeta.height ?? 0) - pad),
          },
        ])
        .webp({ quality: 82 })
        .toFile(webOut);
    } else {
      await resized.webp({ quality: 82 }).toFile(webOut);
    }

    await sharp(src)
      .rotate()
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(thumbOut);

    const db2 = getDb();
    db2
      .update(schema.photos)
      .set({ status: 'ready', updatedAt: Date.now() })
      .where(eq(schema.photos.id, photoId))
      .run();
  } catch (err) {
    console.error(`[derivatives] failed for photo ${photoId}:`, err);
    getDb()
      .update(schema.photos)
      .set({ status: 'error', updatedAt: Date.now() })
      .where(eq(schema.photos.id, photoId))
      .run();
  }
}

export function enqueueDerivatives(photoId: string): void {
  void getQueue().add(() => generateDerivatives(photoId));
}

/** Mark a photo as processing again and enqueue derivative regeneration. */
export function reprocessPhoto(photoId: string): void {
  getDb()
    .update(schema.photos)
    .set({ status: 'processing', updatedAt: Date.now() })
    .where(eq(schema.photos.id, photoId))
    .run();
  enqueueDerivatives(photoId);
}

/** On boot, re-enqueue photos stuck in 'processing' (recoverable from originals). */
export function recoverStuckJobs(): void {
  if (globalForQueue.__bootRecoveryDone) return;
  globalForQueue.__bootRecoveryDone = true;
  const stuck = getDb()
    .select({ id: schema.photos.id })
    .from(schema.photos)
    .where(eq(schema.photos.status, 'processing'))
    .all();
  if (stuck.length > 0) {
    console.log(`[boot] re-enqueueing ${stuck.length} stuck processing photo(s)`);
    for (const p of stuck) enqueueDerivatives(p.id);
  }
}
