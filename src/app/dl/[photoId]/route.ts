import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import {
  bufferResponse,
  defaultDownloadSize,
  parseDownloadSize,
  preparePhotoDownload,
  sizeAllowed,
} from '@/lib/download-delivery';
import { logDownloadEvent, isGalleryExpired } from '@/lib/downloads';
import { galleryRequiresAccess } from '@/lib/pin';
import { streamFileResponse } from '@/lib/stream';
import { getVisitorSession, hasGalleryAccess, isAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ photoId: string }> };

export async function GET(req: Request, { params }: Params) {
  const { photoId } = await params;
  const url = new URL(req.url);
  const sizeParam = parseDownloadSize(url.searchParams.get('size'));

  const db = getDb();
  const photo = db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, photoId))
    .get();
  if (!photo) return new Response('Not found', { status: 404 });

  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, photo.galleryId))
    .get();
  if (!gallery) return new Response('Not found', { status: 404 });

  if (!(await isAdmin())) {
    if (!gallery.published || isGalleryExpired(gallery)) {
      return new Response('Not found', { status: 404 });
    }
    if (
      gallery.type === 'client' &&
      galleryRequiresAccess(gallery) &&
      !(await hasGalleryAccess(gallery.id))
    ) {
      return new Response('Forbidden', { status: 403 });
    }
    if (gallery.type === 'portfolio' || !gallery.downloadEnabled) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  const size = sizeParam ?? defaultDownloadSize(gallery);
  if (!(await isAdmin()) && !sizeAllowed(gallery, size)) {
    return new Response('Size not available', { status: 403 });
  }

  let visitorId: string | null = null;
  let accountId: string | null = null;
  if (gallery.type === 'client') {
    const session = await getVisitorSession(gallery.id);
    if (session.token) {
      const visitor = db
        .select()
        .from(schema.visitors)
        .where(eq(schema.visitors.sessionToken, session.token))
        .get();
      if (visitor && visitor.galleryId === gallery.id) {
        visitorId = visitor.id;
        accountId = visitor.accountId ?? null;
      }
    }
  }

  try {
    const prepared = await preparePhotoDownload({
      gallery,
      photo,
      size,
      visitorId,
      accountId,
    });
    logDownloadEvent(gallery, 'photo', photo.id, visitorId);
    if (prepared.streamFile && prepared.filePath) {
      return streamFileResponse(req, prepared.filePath, {
        contentType: prepared.contentType,
        cacheControl: 'private, max-age=3600',
        downloadName: prepared.downloadName,
      });
    }
    if (prepared.body) {
      return bufferResponse(prepared.body, {
        contentType: prepared.contentType,
        downloadName: prepared.downloadName,
      });
    }
    return new Response('Not found', { status: 404 });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
