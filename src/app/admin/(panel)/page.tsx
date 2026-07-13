import Link from 'next/link';
import { asc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { dirSizeBytes, formatBytes, volumeUsage } from '@/lib/disk';
import { galleryDir } from '@/lib/paths';
import CreateGalleryButton from './CreateGalleryButton';

export const dynamic = 'force-dynamic';

export default function AdminDashboard() {
  const db = getDb();
  const galleries = db
    .select()
    .from(schema.galleries)
    .orderBy(asc(schema.galleries.sortOrder))
    .all();

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

  return (
    <div>
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
                    {gallery.type === 'portfolio' ? 'Portfolio' : 'Client'} ·{' '}
                    {photoCount} photos · {formatBytes(sizeBytes)}
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
                  {gallery.passwordHash && (
                    <span className="text-neutral-400">🔒</span>
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
