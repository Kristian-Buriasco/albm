import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TrendPoint {
  day: string; // YYYY-MM-DD
  count: number;
}

export interface PhotoInsight {
  photoId: string;
  filename: string;
  views: number;
  downloads: number;
  likes: number;
}

export interface LabelCount {
  label: string;
  count: number;
}

export interface GalleryInsights {
  viewTrend: TrendPoint[];
  totalViews: number;
  uniqueVisitors: number;
  conversion: { viewers: number; selectors: number; rate: number };
  perPhoto: PhotoInsight[];
  topCities: LabelCount[];
  referrers: LabelCount[];
  peakHours: number[]; // 24 entries, index = hour of day (local-ish, UTC)
}

/** Fill missing days in a sparse daily trend with zeroes, oldest→newest. */
function fillDays(rows: { day: string; count: number }[], days = 30): TrendPoint[] {
  const map = new Map(rows.map((r) => [r.day, r.count]));
  const out: TrendPoint[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    out.push({ day: d, count: map.get(d) ?? 0 });
  }
  return out;
}

export function galleryInsights(galleryId: string): GalleryInsights {
  const db = getDb();
  const since = Date.now() - 30 * DAY_MS;

  const trendRows = db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${schema.viewEvents.createdAt} / 1000, 'unixepoch')`,
      count: sql<number>`count(*)`,
    })
    .from(schema.viewEvents)
    .where(
      and(
        eq(schema.viewEvents.galleryId, galleryId),
        eq(schema.viewEvents.kind, 'gallery_view'),
        gte(schema.viewEvents.createdAt, since),
      ),
    )
    .groupBy(sql`1`)
    .all();

  const totals = db
    .select({
      total: sql<number>`count(*)`,
      uniq: sql<number>`count(distinct ${schema.viewEvents.visitorId})`,
    })
    .from(schema.viewEvents)
    .where(
      and(
        eq(schema.viewEvents.galleryId, galleryId),
        eq(schema.viewEvents.kind, 'gallery_view'),
      ),
    )
    .get();

  // Conversion: distinct viewers vs distinct visitors who made a selection.
  const viewers = totals?.uniq ?? 0;
  const selectorsRow = db
    .select({ c: sql<number>`count(distinct ${schema.selections.visitorId})` })
    .from(schema.selections)
    .innerJoin(schema.photos, eq(schema.selections.photoId, schema.photos.id))
    .where(eq(schema.photos.galleryId, galleryId))
    .get();
  const selectors = selectorsRow?.c ?? 0;

  // Per-photo views / downloads / likes.
  const viewCounts = db
    .select({ photoId: schema.viewEvents.photoId, c: sql<number>`count(*)` })
    .from(schema.viewEvents)
    .where(
      and(
        eq(schema.viewEvents.galleryId, galleryId),
        eq(schema.viewEvents.kind, 'photo_view'),
      ),
    )
    .groupBy(schema.viewEvents.photoId)
    .all();
  const viewMap = new Map(viewCounts.filter((r) => r.photoId).map((r) => [r.photoId!, r.c]));

  const dlCounts = db
    .select({ photoId: schema.downloadEvents.photoId, c: sql<number>`count(*)` })
    .from(schema.downloadEvents)
    .where(and(eq(schema.downloadEvents.galleryId, galleryId), eq(schema.downloadEvents.kind, 'photo')))
    .groupBy(schema.downloadEvents.photoId)
    .all();
  const dlMap = new Map(dlCounts.filter((r) => r.photoId).map((r) => [r.photoId!, r.c]));

  const photos = db
    .select({ id: schema.photos.id, filename: schema.photos.filename })
    .from(schema.photos)
    .where(eq(schema.photos.galleryId, galleryId))
    .all();

  const likeCounts = db
    .select({ photoId: schema.likes.photoId, c: sql<number>`count(*)` })
    .from(schema.likes)
    .innerJoin(schema.photos, eq(schema.likes.photoId, schema.photos.id))
    .where(eq(schema.photos.galleryId, galleryId))
    .groupBy(schema.likes.photoId)
    .all();
  const likeMap = new Map(likeCounts.map((r) => [r.photoId, r.c]));

  const perPhoto: PhotoInsight[] = photos
    .map((p) => ({
      photoId: p.id,
      filename: p.filename,
      views: viewMap.get(p.id) ?? 0,
      downloads: dlMap.get(p.id) ?? 0,
      likes: likeMap.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.views - a.views || b.downloads - a.downloads || b.likes - a.likes);

  const galleryViewWhere = and(
    eq(schema.viewEvents.galleryId, galleryId),
    eq(schema.viewEvents.kind, 'gallery_view'),
  );

  const cityRows = db
    .select({ label: schema.viewEvents.city, count: sql<number>`count(*)` })
    .from(schema.viewEvents)
    .where(and(galleryViewWhere, sql`${schema.viewEvents.city} is not null`))
    .groupBy(schema.viewEvents.city)
    .orderBy(desc(sql`count(*)`))
    .limit(8)
    .all();

  const refRows = db
    .select({ label: schema.viewEvents.referrer, count: sql<number>`count(*)` })
    .from(schema.viewEvents)
    .where(and(galleryViewWhere, sql`${schema.viewEvents.referrer} is not null`))
    .groupBy(schema.viewEvents.referrer)
    .orderBy(desc(sql`count(*)`))
    .limit(8)
    .all();

  const hourRows = db
    .select({
      hour: sql<string>`strftime('%H', ${schema.viewEvents.createdAt} / 1000, 'unixepoch')`,
      count: sql<number>`count(*)`,
    })
    .from(schema.viewEvents)
    .where(galleryViewWhere)
    .groupBy(sql`1`)
    .all();
  const peakHours = Array.from({ length: 24 }, () => 0);
  for (const r of hourRows) {
    const h = parseInt(r.hour, 10);
    if (h >= 0 && h < 24) peakHours[h] = r.count;
  }

  return {
    viewTrend: fillDays(trendRows),
    totalViews: totals?.total ?? 0,
    uniqueVisitors: viewers,
    conversion: {
      viewers,
      selectors,
      rate: viewers > 0 ? Math.round((selectors / viewers) * 100) : 0,
    },
    perPhoto,
    topCities: cityRows.filter((r) => r.label).map((r) => ({ label: r.label!, count: r.count })),
    referrers: refRows.filter((r) => r.label).map((r) => ({ label: r.label!, count: r.count })),
    peakHours,
  };
}

export interface GlobalAnalytics {
  totals: { views: number; uniqueVisitors: number; downloads: number; selections: number };
  viewTrend: TrendPoint[];
  topGalleries: { id: string; title: string; type: string; views: number }[];
}

export function globalAnalytics(): GlobalAnalytics {
  const db = getDb();
  const since = Date.now() - 30 * DAY_MS;

  const viewTotals = db
    .select({
      views: sql<number>`count(*)`,
      uniq: sql<number>`count(distinct ${schema.viewEvents.visitorId})`,
    })
    .from(schema.viewEvents)
    .where(eq(schema.viewEvents.kind, 'gallery_view'))
    .get();

  const downloads = db
    .select({ c: sql<number>`count(*)` })
    .from(schema.downloadEvents)
    .get();
  const selections = db
    .select({ c: sql<number>`count(*)` })
    .from(schema.selections)
    .get();

  const trendRows = db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${schema.viewEvents.createdAt} / 1000, 'unixepoch')`,
      count: sql<number>`count(*)`,
    })
    .from(schema.viewEvents)
    .where(and(eq(schema.viewEvents.kind, 'gallery_view'), gte(schema.viewEvents.createdAt, since)))
    .groupBy(sql`1`)
    .all();

  const topGalleries = db
    .select({
      id: schema.galleries.id,
      title: schema.galleries.title,
      type: schema.galleries.type,
      views: sql<number>`count(${schema.viewEvents.id})`,
    })
    .from(schema.galleries)
    .leftJoin(
      schema.viewEvents,
      and(
        eq(schema.viewEvents.galleryId, schema.galleries.id),
        eq(schema.viewEvents.kind, 'gallery_view'),
      ),
    )
    .groupBy(schema.galleries.id)
    .orderBy(desc(sql`count(${schema.viewEvents.id})`))
    .limit(8)
    .all();

  return {
    totals: {
      views: viewTotals?.views ?? 0,
      uniqueVisitors: viewTotals?.uniq ?? 0,
      downloads: downloads?.c ?? 0,
      selections: selections?.c ?? 0,
    },
    viewTrend: fillDays(trendRows),
    topGalleries: topGalleries.map((g) => ({ ...g, views: g.views ?? 0 })),
  };
}
