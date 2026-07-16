import fs from 'node:fs';
import { PassThrough, Readable } from 'node:stream';
import archiver from 'archiver';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import {
  defaultDownloadSize,
  parseDownloadSize,
  preparePhotoDownload,
  sizeAllowed,
  type DownloadSize,
} from '@/lib/download-delivery';
import { logDownloadEvent } from '@/lib/downloads';
import { canViewGallery } from '@/lib/gallery-auth';
import { sanitizeSectionFolder } from '@/lib/sections';
import { getVisitorSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ file: string }> };

function titleSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'gallery'
  );
}

export async function GET(req: Request, { params }: Params) {
  const { file } = await params;
  if (!file.endsWith('.zip')) return new Response('Not found', { status: 404 });
  const slug = file.slice(0, -4);
  const url = new URL(req.url);
  const sizeParam = parseDownloadSize(url.searchParams.get('size'));

  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.slug, slug))
    .get();
  if (!gallery || gallery.type !== 'client') return new Response('Not found', { status: 404 });
  if (!(await canViewGallery(gallery))) return new Response('Not found', { status: 404 });
  if (!gallery.downloadEnabled || !gallery.favoritesDownloadEnabled) {
    return new Response('Forbidden', { status: 403 });
  }

  const size: DownloadSize = sizeParam ?? defaultDownloadSize(gallery);
  if (!sizeAllowed(gallery, size)) {
    return new Response('Size not available', { status: 403 });
  }

  const session = await getVisitorSession(gallery.id);
  if (!session.token) return new Response('Unauthorized', { status: 401 });
  const visitor = db
    .select()
    .from(schema.visitors)
    .where(eq(schema.visitors.sessionToken, session.token))
    .get();
  if (!visitor || visitor.galleryId !== gallery.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const listIdParam = url.searchParams.get('listId');
  const listFilter =
    listIdParam && listIdParam.length > 0
      ? eq(schema.selections.listId, listIdParam)
      : isNull(schema.selections.listId);

  const selected = db
    .select({ photo: schema.photos })
    .from(schema.selections)
    .innerJoin(schema.photos, eq(schema.selections.photoId, schema.photos.id))
    .where(
      and(
        eq(schema.selections.visitorId, visitor.id),
        eq(schema.photos.status, 'ready'),
        listFilter,
      ),
    )
    .orderBy(asc(schema.photos.sortOrder))
    .all()
    .map((r) => r.photo);

  if (selected.length === 0) {
    return new Response('No selections to download', { status: 400 });
  }

  const sections = db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.galleryId, gallery.id))
    .orderBy(asc(schema.sections.sortOrder))
    .all();
  const sectionMap = new Map(sections.map((s) => [s.id, s.title]));
  const hasSections = sections.length > 0;

  const archive = archiver('zip', { store: true });
  const out = new PassThrough();
  archive.pipe(out);

  const abort = (err: Error) => {
    console.error('[favorites-zip] stream error:', err.message);
    archive.destroy();
    out.destroy(err);
  };
  archive.on('error', abort);
  out.on('error', () => {});

  for (const photo of selected) {
    try {
      const prepared = await preparePhotoDownload({
        gallery,
        photo,
        size,
        visitorId: visitor.id,
        accountId: visitor.accountId ?? null,
      });
      let zipName = prepared.downloadName;
      if (hasSections && photo.sectionId) {
        const folder = sanitizeSectionFolder(sectionMap.get(photo.sectionId) ?? 'section');
        zipName = `${folder}/${prepared.downloadName}`;
      }
      if (prepared.streamFile && prepared.filePath && fs.existsSync(prepared.filePath)) {
        archive.file(prepared.filePath, { name: zipName });
      } else if (prepared.body) {
        archive.append(prepared.body, { name: zipName });
      }
    } catch (err) {
      console.warn('[favorites-zip] skip photo', photo.id, err);
    }
  }
  archive.finalize().catch(abort);

  logDownloadEvent(gallery, 'favorites_zip', null, visitor.id);

  return new Response(Readable.toWeb(out) as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${titleSlug(gallery.title)}-selections.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
