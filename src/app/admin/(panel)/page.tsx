import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { BarChart, LineChart } from '@/components/AdminCharts';
import AdminGalleryList, { type GalleryListRow } from '@/components/AdminGalleryList';
import ExpiredGalleryActions from '@/components/ExpiredGalleryActions';
import { pendingCommentCount } from '@/lib/comments';
import { formatBytes } from '@/lib/disk';
import { getStorageSnapshot } from '@/lib/storage-cache';
import { globalAnalytics } from '@/lib/analytics';
import { isGalleryExpired } from '@/lib/downloads';
import { getPrincipal } from '@/lib/session';
import { collaboratorGalleryIds } from '@/lib/grants';
import CreateGalleryButton from './CreateGalleryButton';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const principal = await getPrincipal();
  if (!principal) redirect('/admin/login');
  const isOwner = principal.role === 'owner';

  const db = getDb();
  const allGalleries = db
    .select()
    .from(schema.galleries)
    .orderBy(asc(schema.galleries.sortOrder))
    .all();

  if (!isOwner) {
    const grantedIds = new Set(collaboratorGalleryIds(principal.collaboratorId));
    const galleries = allGalleries.filter((g) => grantedIds.has(g.id));
    const listRows: GalleryListRow[] = galleries.map((g) => ({
      id: g.id,
      title: g.title,
      type: g.type,
      published: g.published,
      expiresAt: g.expiresAt,
      folderId: null,
      photoCount:
        db
          .select({ c: sql<number>`count(*)` })
          .from(schema.photos)
          .where(eq(schema.photos.galleryId, g.id))
          .get()?.c ?? 0,
      sizeBytes: 0,
      expired: isGalleryExpired(g),
      coverPhotoId: g.previewPhotoId ?? g.coverPhotoId ?? null,
    }));
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-sm font-medium tracking-widest uppercase">Your galleries</h1>
        </div>
        {listRows.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No galleries have been shared with you yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {listRows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/galleries/${r.id}`}
                  className="block border border-neutral-200 px-4 py-3 text-sm hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
                >
                  <span className="font-medium">{r.title}</span>
                  <span className="ml-2 text-neutral-500">{r.photoCount} photos</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const galleries = allGalleries;

  const pendingComments = pendingCommentCount();
  const storage = getStorageSnapshot();

  const listRows: GalleryListRow[] = galleries.map((g) => ({
    id: g.id,
    title: g.title,
    type: g.type,
    published: g.published,
    expiresAt: g.expiresAt,
    folderId: g.folderId,
    photoCount:
      db
        .select({ c: sql<number>`count(*)` })
        .from(schema.photos)
        .where(eq(schema.photos.galleryId, g.id))
        .get()?.c ?? 0,
    sizeBytes: storage.galleries.find((s) => s.id === g.id)?.sizeBytes ?? 0,
    expired: isGalleryExpired(g),
    // Explicit cover/preview, else fall back to the first ready photo so the
    // row thumbnail isn't an empty box for galleries without a chosen cover.
    coverPhotoId:
      g.previewPhotoId ??
      g.coverPhotoId ??
      db
        .select({ id: schema.photos.id })
        .from(schema.photos)
        .where(and(eq(schema.photos.galleryId, g.id), eq(schema.photos.status, 'ready')))
        .orderBy(asc(schema.photos.sortOrder))
        .get()?.id ??
      null,
  }));

  const folders = db
    .select()
    .from(schema.galleryFolders)
    .orderBy(asc(schema.galleryFolders.sortOrder))
    .all();

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const viewRows = db
    .select({ day: sql<number>`date(${schema.viewEvents.createdAt} / 1000, 'unixepoch')`, c: sql<number>`count(*)` })
    .from(schema.viewEvents)
    .where(sql`${schema.viewEvents.createdAt} >= ${thirtyDaysAgo}`)
    .groupBy(sql`date(${schema.viewEvents.createdAt} / 1000, 'unixepoch')`)
    .all();
  const viewsOverTime = viewRows.map((r, i) => ({
    x: i,
    y: r.c,
    label: String(r.day),
  }));

  const galleryViews = galleries.map((g) => ({
    label: g.title.slice(0, 8),
    value:
      db
        .select({ c: sql<number>`count(*)` })
        .from(schema.viewEvents)
        .where(eq(schema.viewEvents.galleryId, g.id))
        .get()?.c ?? 0,
  }));

  const expiredRows = listRows.filter((r) => r.expired && r.type === 'client');
  const usedPct = Math.round((storage.disk.usedBytes / storage.disk.totalBytes) * 100);
  const totals = globalAnalytics().totals;
  const statTiles = [
    { label: 'Total views', value: totals.views },
    { label: 'Unique visitors', value: totals.uniqueVisitors },
    { label: 'Downloads', value: totals.downloads },
    { label: 'Selections', value: totals.selections },
  ];

  return (
    <div>
      {pendingComments > 0 && (
        <p className="mb-4 rounded border border-amber-600/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {pendingComments} comment{pendingComments > 1 ? 's' : ''} awaiting moderation
        </p>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {statTiles.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <p className="text-2xl font-medium tabular-nums">{s.value.toLocaleString()}</p>
            <p className="mt-1 text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-8 grid gap-8 md:grid-cols-2">
        <LineChart data={viewsOverTime} title="Views (30 days)" />
        <BarChart items={galleryViews.filter((g) => g.value > 0).slice(0, 8)} title="Views by gallery" />
      </div>

      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs tracking-widest text-neutral-500 uppercase">Storage</h2>
          <a href="/api/admin/storage?refresh=1" className="text-xs underline">
            Refresh
          </a>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="h-full rounded-full bg-neutral-900 dark:bg-neutral-100"
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Data dir {formatBytes(storage.dataDirBytes)} · Volume {formatBytes(storage.disk.usedBytes)} /{' '}
          {formatBytes(storage.disk.totalBytes)} · {formatBytes(storage.disk.freeBytes)} free
        </p>
      </div>

      {expiredRows.length > 0 && (
        <div className="mb-8 rounded border border-amber-500/40 p-4">
          <h2 className="mb-2 text-xs font-medium tracking-widest uppercase text-amber-800 dark:text-amber-200">
            Expired galleries
          </h2>
          <ul className="space-y-2 text-xs">
            {expiredRows.map((r) => {
              const stor = storage.galleries.find((s) => s.id === r.id);
              return (
              <li key={r.id} className="flex flex-wrap items-center gap-3">
                <Link href={`/admin/galleries/${r.id}`} className="font-medium underline">
                  {r.title}
                </Link>
                <span className="text-neutral-500">
                  {r.photoCount} photos · {formatBytes(r.sizeBytes)}
                  {stor && stor.rawCount > 0
                    ? ` · ${stor.rawCount} RAW (${formatBytes(stor.rawBytes)})`
                    : ''}
                </span>
                <ExpiredGalleryActions
                  id={r.id}
                  title={r.title}
                  photoCount={r.photoCount}
                  sizeBytes={r.sizeBytes}
                />
              </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-sm font-medium tracking-widest uppercase">Galleries</h1>
        <CreateGalleryButton />
      </div>

      <Suspense fallback={<p className="text-sm text-neutral-500">Loading…</p>}>
        <AdminGalleryList rows={listRows} initialFolders={folders} />
      </Suspense>
    </div>
  );
}
