import { lt } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import type { Gallery } from '@/db/schema';

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function pruneOldDownloadEvents(): void {
  getDb()
    .delete(schema.downloadEvents)
    .where(lt(schema.downloadEvents.createdAt, Date.now() - RETENTION_MS))
    .run();
}

export function logDownloadEvent(
  gallery: Gallery,
  kind: 'photo' | 'zip' | 'favorites_zip',
  photoId: string | null,
  visitorId: string | null,
): void {
  if (!gallery.trackDownloads) return;
  if (Math.random() < 0.01) pruneOldDownloadEvents();
  getDb()
    .insert(schema.downloadEvents)
    .values({ galleryId: gallery.id, photoId, visitorId, kind })
    .run();
}

export function isGalleryExpired(gallery: Gallery): boolean {
  return Boolean(
    gallery.autoExpire && gallery.expiresAt && Date.now() > gallery.expiresAt,
  );
}
