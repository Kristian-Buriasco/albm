import Link from 'next/link';
import { redirect } from 'next/navigation';
import { asc, eq, gte, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { BarChart, LineChart } from '@/components/AdminCharts';
import { pendingCommentCount } from '@/lib/comments';
import { dirSizeBytes, formatBytes, volumeUsage } from '@/lib/disk';
import { isGalleryExpired } from '@/lib/downloads';
import { galleryDir } from '@/lib/paths';
import { isAdmin } from '@/lib/session';
import CreateGalleryButton from './CreateGalleryButton';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  if (!(await isAdmin())) redirect('/admin/login');

  const db = getDb();
  const galleries = db
    .select()
    .from(schema.galleries)
    .orderBy(asc(schema.galleries.sortOrder))
    .all();

  const pendingComments = pendingCommentCount();

  const rows = galleries.map((g) => {
    const photoCount =
      db
        .select({ c: sql<number>`count(*)` })
        .from(schema.photos)
        .where(eq(schema.photos.galleryId, g.id))
        .get()?.c ?? 0;
    return { gallery: g, photoCount, sizeBytes: dirSizeBytes(galleryDir(g.id)) };
  });

  const disk = volumeUsage();
  const usedPct = Math.round((disk.usedBytes / disk.totalBytes) * 100);

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const viewRows = db
    .select({ day: sql<number>`date(${schema.viewEvents.createdAt} / 1000, 'unixepoch')`, c: sql<number>`count(*)` })
    .from(schema.viewEvents)
    .where(gte(schema.viewEvents.createdAt, thirtyDaysAgo))
    .groupBy(sql`date(${schema.viewEvents.createdAt} / 1000, 'unixepoch')`)
    .all();
  const viewsOverTime = viewRows.map((r, i) => ({ x: i, y: r.c }));

  const galleryViews = galleries.map((g) => ({
    label: g.title.slice(0, 8),
    value:
      db
        .select({ c: sql<number>`count(*)` })
        .from(schema.viewEvents)
        .where(eq(schema.viewEvents.galleryId, g.id))
        .get()?.c ?? 0,
  }));

  return (
    <div>
      {pendingComments > 0 && (
        <p className="mb-4 rounded border border-amber-600/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {pendingComments} comment{pendingComments > 1 ? 's' : ''} awaiting moderation
        </p>
      )}

      <div className="mb-8 grid gap-8 md:grid-cols-2">
        <LineChart data={viewsOverTime} title="Views (30 days)" />
        <BarChart items={galleryViews.filter((g) => g.value > 0).slice(0, 8)} title="Views by gallery" />
      </div>

      <div className="mb-8">
        <h2 className="mb-2 text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
          Disk usage
        </h2>
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="h-full rounded-full bg-neutral-900 dark:bg-neutral-100"
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          {formatBytes(disk.usedBytes)} used of {formatBytes(disk.totalBytes)} ·{' '}
          {formatBytes(disk.freeBytes)} free
        </p>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-sm font-medium tracking-widest uppercase">Galleries</h1>
        <CreateGalleryButton />
      </div>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No galleries yet. Create your first one.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {rows.map(({ gallery, photoCount, sizeBytes }) => (
            <li key={gallery.id}>
              <Link
                href={`/admin/galleries/${gallery.id}`}
                className="flex items-center justify-between gap-4 py-4 transition-colors hover:bg-neutral-100/60 dark:hover:bg-neutral-900/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{gallery.title}</p>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {gallery.type === 'portfolio' ? 'Portfolio' : 'Client'} · {photoCount} photos ·{' '}
                    {formatBytes(sizeBytes)}
                    {isGalleryExpired(gallery) ? ' · Expired' : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[11px]">
                  {gallery.published ? (
                    <span className="rounded-full border border-neutral-900 px-2 py-0.5 dark:border-neutral-100">
                      Published
                    </span>
                  ) : (
                    <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                      Draft
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
