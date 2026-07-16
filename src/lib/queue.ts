import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import PQueue from 'p-queue';
import sharp from 'sharp';
import { getDb, schema } from '@/db';
import { thumbPath, resolveWatermarkPath, webPath, originalPath, workingJpegPath } from './paths';
import { generatePlaceholder } from './photo-media';

sharp.cache(false);
sharp.concurrency(1);

const globalForQueue = globalThis as unknown as {
  __derivativeQueue?: PQueue;
  __bootRecoveryDone?: boolean;
};

function getQueue(): PQueue {
  return (globalForQueue.__derivativeQueue ??= new PQueue({ concurrency: 1 }));
}

type WmPosition = 'br' | 'bl' | 'tr' | 'tl' | 'center';

function watermarkPlacement(
  pos: WmPosition,
  imgW: number,
  imgH: number,
  wmW: number,
  wmH: number,
  pad: number,
): { left: number; top: number } {
  switch (pos) {
    case 'bl':
      return { left: pad, top: Math.max(0, imgH - wmH - pad) };
    case 'tr':
      return { left: Math.max(0, imgW - wmW - pad), top: pad };
    case 'tl':
      return { left: pad, top: pad };
    case 'center':
      return {
        left: Math.max(0, Math.round((imgW - wmW) / 2)),
        top: Math.max(0, Math.round((imgH - wmH) / 2)),
      };
    case 'br':
    default:
      return {
        left: Math.max(0, imgW - wmW - pad),
        top: Math.max(0, imgH - wmH - pad),
      };
  }
}

function derivativeSource(photo: { galleryId: string; filename: string; isRaw: boolean }): string {
  if (photo.isRaw) {
    const working = workingJpegPath(photo.galleryId, photo.filename);
    if (fs.existsSync(working)) return working;
  }
  return originalPath(photo.galleryId, photo.filename);
}

async function generateDerivatives(photoId: string): Promise<void> {
  const db = getDb();
  const photo = db.select().from(schema.photos).where(eq(schema.photos.id, photoId)).get();
  if (!photo) return;
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, photo.galleryId))
    .get();
  if (!gallery) return;

  const src = derivativeSource(photo);
  const webOut = webPath(photo.galleryId, photo.filename);
  const thumbOut = thumbPath(photo.galleryId, photo.filename);

  try {
    fs.mkdirSync(path.dirname(webOut), { recursive: true });
    fs.mkdirSync(path.dirname(thumbOut), { recursive: true });

    const resized = sharp(src).rotate().resize(2048, 2048, {
      fit: 'inside',
      withoutEnlargement: true,
    });

    const wmPath = resolveWatermarkPath(photo.galleryId);
    if (gallery.watermarkEnabled && fs.existsSync(wmPath)) {
      const resizedBuf = await resized.toBuffer();
      const meta = await sharp(resizedBuf).metadata();
      const imgW = meta.width ?? 2048;
      const imgH = meta.height ?? 2048;
      const scalePct = Math.min(100, Math.max(5, gallery.watermarkScale ?? 25)) / 100;
      const targetW = Math.max(1, Math.round(imgW * scalePct));
      const pad = Math.max(8, Math.round(imgW * 0.02));
      const opacity = Math.min(100, Math.max(0, gallery.watermarkOpacity ?? 70)) / 100;
      const wm = await sharp(wmPath)
        .resize(targetW, undefined, { fit: 'inside', withoutEnlargement: true })
        .ensureAlpha()
        .composite([
          {
            input: Buffer.from([255, 255, 255, Math.round(opacity * 255)]),
            raw: { width: 1, height: 1, channels: 4 },
            tile: true,
            blend: 'dest-in',
          },
        ])
        .png()
        .toBuffer();
      const wmMeta = await sharp(wm).metadata();
      const wmW = wmMeta.width ?? 0;
      const wmH = wmMeta.height ?? 0;
      const pos = (gallery.watermarkPosition ?? 'br') as WmPosition;
      const { left, top } = watermarkPlacement(pos, imgW, imgH, wmW, wmH, pad);
      await sharp(resizedBuf)
        .composite([{ input: wm, left, top }])
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

    let placeholder: string | null = null;
    try {
      placeholder = await generatePlaceholder(src);
    } catch {
      /* optional */
    }

    getDb()
      .update(schema.photos)
      .set({
        status: 'ready',
        updatedAt: Date.now(),
        ...(placeholder ? { placeholder } : {}),
      })
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

export function reprocessPhoto(photoId: string): void {
  getDb()
    .update(schema.photos)
    .set({ status: 'processing', updatedAt: Date.now() })
    .where(eq(schema.photos.id, photoId))
    .run();
  enqueueDerivatives(photoId);
}

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

export function shouldReprocessWatermark(galleryUpdates: Record<string, unknown>): boolean {
  return (
    'watermarkEnabled' in galleryUpdates ||
    'watermarkPosition' in galleryUpdates ||
    'watermarkOpacity' in galleryUpdates ||
    'watermarkScale' in galleryUpdates
  );
}
