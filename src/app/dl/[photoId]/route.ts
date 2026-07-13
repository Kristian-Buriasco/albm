import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { canViewGallery } from '@/lib/gallery-auth';
import { originalPath } from '@/lib/paths';
import { isAdmin } from '@/lib/session';
import { contentTypeForFilename, streamFileResponse } from '@/lib/stream';

type Params = { params: Promise<{ photoId: string }> };

export async function GET(req: Request, { params }: Params) {
  const { photoId } = await params;

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

  const admin = await isAdmin();
  if (!admin) {
    if (!(await canViewGallery(gallery))) {
      return new Response('Forbidden', { status: 403 });
    }
    // Originals of portfolio photos are never downloadable publicly,
    // and client downloads require the master switch.
    if (gallery.type === 'portfolio' || !gallery.downloadEnabled) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  return streamFileResponse(req, originalPath(photo.galleryId, photo.filename), {
    contentType: contentTypeForFilename(photo.filename),
    cacheControl: 'private, max-age=3600',
    downloadName: photo.filename,
  });
}
