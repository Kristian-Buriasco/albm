import fs from 'node:fs';
import { PassThrough, Readable } from 'node:stream';
import archiver from 'archiver';
import { asc, and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { canViewGallery } from '@/lib/gallery-auth';
import { originalPath } from '@/lib/paths';
import { isAdmin } from '@/lib/session';

type Params = { params: Promise<{ file: string }> };

function titleSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'gallery'
  );
}

export async function GET(_req: Request, { params }: Params) {
  const { file } = await params;
  if (!file.endsWith('.zip')) return new Response('Not found', { status: 404 });
  const slug = file.slice(0, -4);

  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.slug, slug))
    .get();
  if (!gallery) return new Response('Not found', { status: 404 });

  const admin = await isAdmin();
  if (!admin) {
    if (!(await canViewGallery(gallery))) {
      return new Response('Forbidden', { status: 403 });
    }
    if (gallery.type === 'portfolio' || !gallery.downloadEnabled) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  const photos = db
    .select()
    .from(schema.photos)
    .where(
      and(eq(schema.photos.galleryId, gallery.id), eq(schema.photos.status, 'ready')),
    )
    .orderBy(asc(schema.photos.sortOrder))
    .all();

  // Store mode: JPEGs don't compress, keep CPU near zero. Stream straight
  // through to the response; nothing is buffered or written to disk.
  const archive = archiver('zip', { store: true });
  const out = new PassThrough();
  archive.pipe(out);

  archive.on('error', (err) => {
    console.error('[zip] archive error:', err);
    out.destroy(err);
  });

  for (const photo of photos) {
    const p = originalPath(photo.galleryId, photo.filename);
    if (fs.existsSync(p)) {
      archive.append(fs.createReadStream(p), { name: photo.filename });
    }
  }
  void archive.finalize();

  return new Response(Readable.toWeb(out) as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${titleSlug(gallery.title)}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
