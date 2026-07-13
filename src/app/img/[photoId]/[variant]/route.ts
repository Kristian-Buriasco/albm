import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { canViewGallery } from '@/lib/gallery-auth';
import { thumbPath, webPath } from '@/lib/paths';
import { streamFileResponse } from '@/lib/stream';

type Params = { params: Promise<{ photoId: string; variant: string }> };

export async function GET(req: Request, { params }: Params) {
  const { photoId, variant } = await params;
  if (variant !== 'thumb' && variant !== 'web') {
    return new Response('Not found', { status: 404 });
  }

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

  if (!(await canViewGallery(gallery))) {
    return new Response('Forbidden', { status: 403 });
  }

  const filePath =
    variant === 'thumb'
      ? thumbPath(photo.galleryId, photo.filename)
      : webPath(photo.galleryId, photo.filename);

  const cacheControl =
    gallery.type === 'portfolio'
      ? 'public, max-age=86400'
      : 'private, max-age=3600';

  return streamFileResponse(req, filePath, {
    contentType: 'image/webp',
    cacheControl,
  });
}
