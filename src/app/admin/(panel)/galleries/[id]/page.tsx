import { notFound, redirect } from 'next/navigation';
import { asc, eq, gte, inArray, max, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { dirSizeBytes } from '@/lib/disk';
import { galleryDir } from '@/lib/paths';
import { BASE_URL } from '@/lib/env';
import { getPrincipal } from '@/lib/session';
import { collaboratorHasCapability } from '@/lib/grants';
import { topViewedPhotos } from '@/lib/views';
import { galleryInsights, type GalleryInsights } from '@/lib/analytics';
import { getGalleryTimeline, type TimelineItem } from '@/lib/lifecycle';
import GalleryAdmin from './GalleryAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminGalleryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Per-page auth check: the layout check alone is bypassable via RSC
  // segment requests (layouts render in parallel with pages).
  const principal = await getPrincipal();
  if (!principal) redirect('/admin/login');

  const { id } = await params;
  const isOwner = principal.role === 'owner';
  if (
    !isOwner &&
    !collaboratorHasCapability(id, principal.collaboratorId, 'upload') &&
    !collaboratorHasCapability(id, principal.collaboratorId, 'organize')
  ) {
    // No grant on this gallery — 404 rather than leak existence.
    notFound();
  }

  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, id))
    .get();
  if (!gallery) notFound();

  const photos = db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.galleryId, id))
    .orderBy(asc(schema.photos.sortOrder))
    .all();

  // Owner-only analytics/PII — never computed (let alone shipped in the RSC
  // payload) for a collaborator. Hiding sections client-side isn't enough:
  // the data would still ride along to their browser.
  let visitors: { id: string; name: string | null; email: string | null }[] = [];
  let selections: { photoId: string; visitorId: string }[] = [];
  let likeCounts: Record<string, number> = {};
  let viewStats = { total: 0, last7: 0, lastAt: null as number | null };
  let topViewed: { photoId: string; count: number }[] = [];
  let sizeBytes = 0;
  let insights: GalleryInsights | null = null;
  let timeline: TimelineItem[] = [];

  if (isOwner) {
    const visitorRows = db
      .select()
      .from(schema.visitors)
      .where(eq(schema.visitors.galleryId, id))
      .orderBy(asc(schema.visitors.createdAt))
      .all();
    visitors = visitorRows.map((v) => ({ id: v.id, name: v.name, email: v.email }));

    selections =
      photos.length > 0
        ? db
            .select({
              photoId: schema.selections.photoId,
              visitorId: schema.selections.visitorId,
            })
            .from(schema.selections)
            .where(
              inArray(
                schema.selections.photoId,
                photos.map((p) => p.id),
              ),
            )
            .all()
        : [];

    const likeCountRows =
      photos.length > 0
        ? db
            .select({
              photoId: schema.likes.photoId,
              count: sql<number>`count(*)`,
            })
            .from(schema.likes)
            .where(
              inArray(
                schema.likes.photoId,
                photos.map((p) => p.id),
              ),
            )
            .groupBy(schema.likes.photoId)
            .all()
        : [];
    likeCounts = Object.fromEntries(likeCountRows.map((r) => [r.photoId, r.count]));

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const viewTotals = db
      .select({
        total: sql<number>`count(*)`,
        lastAt: max(schema.viewEvents.createdAt),
      })
      .from(schema.viewEvents)
      .where(eq(schema.viewEvents.galleryId, id))
      .get();
    const last7 =
      db
        .select({ c: sql<number>`count(*)` })
        .from(schema.viewEvents)
        .where(
          sql`${schema.viewEvents.galleryId} = ${id} and ${gte(schema.viewEvents.createdAt, sevenDaysAgo)}`,
        )
        .get()?.c ?? 0;
    viewStats = { total: viewTotals?.total ?? 0, last7, lastAt: viewTotals?.lastAt ?? null };

    topViewed = topViewedPhotos(id);
    sizeBytes = dirSizeBytes(galleryDir(id));
    insights = galleryInsights(id);
    timeline = getGalleryTimeline(id);
  }

  // Don't ship secret hashes to a collaborator's browser even though the
  // owner-only UI that would read them is hidden client-side.
  const galleryForClient = isOwner
    ? gallery
    : { ...gallery, passwordHash: null, pinHash: null };

  return (
    <GalleryAdmin
      gallery={galleryForClient}
      initialPhotos={photos}
      visitors={visitors}
      selections={selections}
      likeCounts={likeCounts}
      viewStats={viewStats}
      sizeBytes={sizeBytes}
      isOwner={isOwner}
      shareUrl={
        gallery.type === 'client'
          ? `${BASE_URL}/g/${gallery.slug}`
          : `${BASE_URL}/portfolio/${gallery.slug}`
      }
      topViewed={topViewed}
      insights={insights}
      timeline={timeline}
    />
  );
}
