import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import PQueue from 'p-queue';
import sharp from 'sharp';
import { getDb, schema } from '@/db';
import { thumbPath, mdPath, resolveWatermarkPath, webPath, originalPath, workingJpegPath } from './paths';
import { generatePlaceholder } from './photo-media';

sharp.cache(false);
sharp.concurrency(1);

const globalForQueue = globalThis as unknown as {
  __derivativeQueue?: PQueue;
  __bootRecoveryDone?: boolean;
};

function getQueue(): PQueue {
  // Photo processing is CPU-bound. DERIVATIVE_CONCURRENCY (default 1) lets a
  // multi-core host work through a big shoot's backlog in parallel.
  const n = Number.parseInt(process.env.DERIVATIVE_CONCURRENCY ?? '', 10);
  const concurrency = Number.isFinite(n) && n >= 1 ? Math.min(n, 8) : 1;
  return (globalForQueue.__derivativeQueue ??= new PQueue({ concurrency }));
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

export interface WatermarkOpts {
  enabled: boolean;
  scale?: number | null;
  opacity?: number | null;
  position?: string | null;
}

export function watermarkOptsFor(gallery: {
  watermarkEnabled: boolean;
  watermarkScale?: number | null;
  watermarkOpacity?: number | null;
  watermarkPosition?: string | null;
}): WatermarkOpts {
  return {
    enabled: gallery.watermarkEnabled,
    scale: gallery.watermarkScale,
    opacity: gallery.watermarkOpacity,
    position: gallery.watermarkPosition,
  };
}

/**
 * Resize `src` to fit within `maxEdge` and write a WebP to `outPath`, compositing
 * the gallery/global watermark when `wm.enabled`. Shared by the derivative queue,
 * the lazy `/img` generator, and the backfill script so all three stay identical.
 */
export async function renderWebpVariant(
  src: string,
  maxEdge: number,
  quality: number,
  outPath: string,
  galleryId: string,
  wm: WatermarkOpts,
): Promise<void> {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const resized = sharp(src)
    .rotate()
    .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true });

  const wmPath = resolveWatermarkPath(galleryId);
  if (wm.enabled && fs.existsSync(wmPath)) {
    const resizedBuf = await resized.toBuffer();
    const meta = await sharp(resizedBuf).metadata();
    const imgW = meta.width ?? maxEdge;
    const imgH = meta.height ?? maxEdge;
    const scalePct = Math.min(100, Math.max(5, wm.scale ?? 25)) / 100;
    const targetW = Math.max(1, Math.round(imgW * scalePct));
    const pad = Math.max(8, Math.round(imgW * 0.02));
    const opacity = Math.min(100, Math.max(0, wm.opacity ?? 70)) / 100;
    const wmBuf = await sharp(wmPath)
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
    const wmMeta = await sharp(wmBuf).metadata();
    const { left, top } = watermarkPlacement(
      (wm.position ?? 'br') as WmPosition,
      imgW,
      imgH,
      wmMeta.width ?? 0,
      wmMeta.height ?? 0,
      pad,
    );
    await sharp(resizedBuf)
      .composite([{ input: wmBuf, left, top }])
      .webp({ quality })
      .toFile(outPath);
  } else {
    await resized.webp({ quality }).toFile(outPath);
  }
}

export function derivativeSource(photo: { galleryId: string; filename: string; isRaw: boolean }): string {
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
  const mdOut = mdPath(photo.galleryId, photo.filename);
  const thumbOut = thumbPath(photo.galleryId, photo.filename);
  const wm = watermarkOptsFor(gallery);

  try {
    // Full (2048) + mid (1280) carry the watermark; the 400px thumb never does.
    await renderWebpVariant(src, 2048, 82, webOut, photo.galleryId, wm);
    await renderWebpVariant(src, 1280, 82, mdOut, photo.galleryId, wm);
    await renderWebpVariant(src, 400, 75, thumbOut, photo.galleryId, { enabled: false });

    let placeholder: string | null = null;
    try {
      placeholder = await generatePlaceholder(src);
    } catch {
      /* optional */
    }

    // 3A: bib OCR in derivative queue (soft-fail). Keep before ready so search
    // sees digits as soon as the photo is ready when bibSearch is on.
    if (gallery.bibSearch) {
      try {
        const { detectAndStoreBibs } = await import('@/lib/bib-ocr');
        await detectAndStoreBibs(photoId, photo.galleryId, webOut);
      } catch (err) {
        console.error(`[bib-ocr] soft-fail photo ${photoId}:`, err);
      }
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
