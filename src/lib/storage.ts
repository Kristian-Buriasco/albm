import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { dirSizeBytes, formatBytes, volumeUsage } from '@/lib/disk';
import { galleryDir } from '@/lib/paths';

export { formatBytes, volumeUsage };

export type StorageState = 'ok' | 'warn' | 'over';

export interface GalleryStorageUsage {
  galleryId: string;
  usedBytes: number;
  quotaBytes: number | null;
  pct: number | null;
  state: StorageState;
}

/** Soft/advisory quota check — never blocks uploads, informational only. */
export function storageStateFor(usedBytes: number, quotaBytes: number | null): {
  pct: number | null;
  state: StorageState;
} {
  if (quotaBytes == null || quotaBytes <= 0) {
    return { pct: null, state: 'ok' };
  }
  const pct = (usedBytes / quotaBytes) * 100;
  const state: StorageState = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
  return { pct, state };
}

/** Per-gallery on-disk usage vs. its (optional) soft quota. */
export function galleryStorageUsage(galleryId: string): GalleryStorageUsage {
  const db = getDb();
  const gallery = db
    .select({ storageQuotaBytes: schema.galleries.storageQuotaBytes })
    .from(schema.galleries)
    .where(eq(schema.galleries.id, galleryId))
    .get();
  const usedBytes = dirSizeBytes(galleryDir(galleryId));
  const quotaBytes = gallery?.storageQuotaBytes ?? null;
  const { pct, state } = storageStateFor(usedBytes, quotaBytes);
  return { galleryId, usedBytes, quotaBytes, pct, state };
}

export interface AllGalleriesStorageUsage {
  galleries: (GalleryStorageUsage & { title: string })[];
  volume: ReturnType<typeof volumeUsage>;
}

/** Usage for every gallery plus overall volume usage (for the maintenance dashboard). */
export function allGalleriesStorageUsage(): AllGalleriesStorageUsage {
  const db = getDb();
  const rows = db
    .select({
      id: schema.galleries.id,
      title: schema.galleries.title,
      storageQuotaBytes: schema.galleries.storageQuotaBytes,
    })
    .from(schema.galleries)
    .all();

  const galleries = rows.map((g) => {
    const usedBytes = dirSizeBytes(galleryDir(g.id));
    const { pct, state } = storageStateFor(usedBytes, g.storageQuotaBytes);
    return {
      galleryId: g.id,
      title: g.title,
      usedBytes,
      quotaBytes: g.storageQuotaBytes,
      pct,
      state,
    };
  });

  return { galleries, volume: volumeUsage() };
}
