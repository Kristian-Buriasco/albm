import { DATA_DIR } from './env';
import { dirSizeBytes, formatBytes, volumeUsage, type DiskUsage } from './disk';
import { getDb, schema } from '@/db';
import { and, asc, eq, sql } from 'drizzle-orm';

export type GalleryStorageRow = {
  id: string;
  title: string;
  type: string;
  photoCount: number;
  sizeBytes: number;
  rawCount: number;
  rawBytes: number;
};

export type StorageSnapshot = {
  computedAt: number;
  disk: DiskUsage;
  dataDirBytes: number;
  galleries: GalleryStorageRow[];
};

const CACHE_TTL_MS = 60 * 60 * 1000;

const globalCache = globalThis as unknown as {
  __storageSnapshot?: StorageSnapshot;
};

export function getStorageSnapshot(force = false): StorageSnapshot {
  const cached = globalCache.__storageSnapshot;
  const db = getDb();
  // A gallery created after the snapshot is not in it (it would show 0 B): refresh in that case.
  const known = cached ? new Set(cached.galleries.map((g) => g.id)) : null;
  const stale = !!known && db.select({ id: schema.galleries.id }).from(schema.galleries).all().some((g) => !known.has(g.id));
  if (!force && cached && !stale && Date.now() - cached.computedAt < CACHE_TTL_MS) {
    return cached;
  }

  const galleries = db
    .select()
    .from(schema.galleries)
    .orderBy(asc(schema.galleries.sortOrder))
    .all();

  const rows: GalleryStorageRow[] = galleries.map((g) => {
    const photoCount =
      db
        .select({ c: sql<number>`count(*)` })
        .from(schema.photos)
        .where(eq(schema.photos.galleryId, g.id))
        .get()?.c ?? 0;
    // Photo bytes come from the database, so photos kept only in the bucket still count.
    const total =
      db
        .select({ bytes: sql<number>`coalesce(sum(${schema.photos.sizeBytes}), 0)` })
        .from(schema.photos)
        .where(eq(schema.photos.galleryId, g.id))
        .get()?.bytes ?? 0;
    const raw = db
      .select({
        c: sql<number>`count(*)`,
        bytes: sql<number>`coalesce(sum(${schema.photos.sizeBytes}), 0)`,
      })
      .from(schema.photos)
      .where(and(eq(schema.photos.galleryId, g.id), eq(schema.photos.isRaw, true)))
      .get();
    return {
      id: g.id,
      title: g.title,
      type: g.type,
      photoCount,
      sizeBytes: total,
      rawCount: raw?.c ?? 0,
      rawBytes: raw?.bytes ?? 0,
    };
  });

  const snap: StorageSnapshot = {
    computedAt: Date.now(),
    disk: volumeUsage(),
    dataDirBytes: dirSizeBytes(DATA_DIR),
    galleries: rows,
  };
  globalCache.__storageSnapshot = snap;
  return snap;
}

export { formatBytes };
