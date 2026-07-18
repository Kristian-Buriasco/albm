import { lt, eq, sql, and, isNotNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { getDb, schema } from '@/db';
import { lookupGeo, referrerSource } from './geo';
import { BASE_URL } from './env';

let baseHost = '';
try {
  baseHost = new URL(BASE_URL).host;
} catch {
  baseHost = '';
}

const DEBOUNCE_MS = 30 * 60 * 1000;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const globalForViews = globalThis as unknown as {
  __viewDebounce?: Map<string, number>;
};
const debounceStore = (globalForViews.__viewDebounce ??= new Map());

async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const parts = xff
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return parts[parts.length - 1] ?? 'unknown';
  }
  return h.get('x-real-ip') ?? 'unknown';
}

export function pruneOldViewEvents(): void {
  getDb()
    .delete(schema.viewEvents)
    .where(lt(schema.viewEvents.createdAt, Date.now() - RETENTION_MS))
    .run();
}

function shouldRecord(key: string): boolean {
  const now = Date.now();
  const last = debounceStore.get(key);
  if (last !== undefined && now - last < DEBOUNCE_MS) return false;
  debounceStore.set(key, now);
  return true;
}

export async function recordGalleryView(
  galleryId: string,
  visitorId: string | null,
  sessionToken?: string | null,
): Promise<void> {
  const sessionKey =
    visitorId ??
    (sessionToken ? `tok:${sessionToken}` : `anon:${await clientIp()}`);
  if (!shouldRecord(`${galleryId}:${sessionKey}:gallery`)) return;

  if (Math.random() < 0.01) pruneOldViewEvents();

  const h = await headers();
  const geo = await lookupGeo(await clientIp());
  const referrer = referrerSource(h.get('referer'), baseHost);

  getDb()
    .insert(schema.viewEvents)
    .values({
      galleryId,
      visitorId,
      kind: 'gallery_view',
      country: geo.country,
      city: geo.city,
      referrer,
    })
    .run();
}

export async function recordPhotoView(
  galleryId: string,
  photoId: string,
  visitorId: string | null,
  sessionToken?: string | null,
): Promise<void> {
  const sessionKey =
    visitorId ??
    (sessionToken ? `tok:${sessionToken}` : `anon:${await clientIp()}`);
  if (!shouldRecord(`${galleryId}:${photoId}:${sessionKey}`)) return;

  getDb()
    .insert(schema.viewEvents)
    .values({
      galleryId,
      photoId,
      visitorId,
      kind: 'photo_view',
    })
    .run();
}

export function topViewedPhotos(
  galleryId: string,
  limit = 8,
): { photoId: string; count: number }[] {
  return getDb()
    .select({
      photoId: schema.viewEvents.photoId,
      count: sql<number>`count(*)`,
    })
    .from(schema.viewEvents)
    .where(
      and(
        eq(schema.viewEvents.galleryId, galleryId),
        eq(schema.viewEvents.kind, 'photo_view'),
        isNotNull(schema.viewEvents.photoId),
      ),
    )
    .groupBy(schema.viewEvents.photoId)
    .orderBy(sql`count(*) desc`)
    .limit(limit)
    .all()
    .filter((r) => r.photoId)
    .map((r) => ({ photoId: r.photoId!, count: r.count }));
}
