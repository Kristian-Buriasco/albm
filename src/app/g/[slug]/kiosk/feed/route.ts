import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { needsAccessGate } from '@/lib/gallery-auth';
import { hasGalleryAccess, isAdmin } from '@/lib/session';
import { isGalleryExpired } from '@/lib/downloads';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/** JSON feed of ready photos for the kiosk poller. Same gate as the kiosk page. */
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(and(eq(schema.galleries.slug, slug), eq(schema.galleries.type, 'client')))
    .get();

  const admin = await isAdmin();
  if (!gallery || (!gallery.published && !admin)) {
    return new Response('Not found', { status: 404 });
  }
  if (!admin && isGalleryExpired(gallery)) {
    return new Response('Not found', { status: 404 });
  }
  if (!gallery.kioskEnabled) {
    return new Response('Not found', { status: 404 });
  }
  if (needsAccessGate(gallery) && !admin && !(await hasGalleryAccess(gallery.id))) {
    return new Response('Forbidden', { status: 403 });
  }

  const photos = db
    .select({
      id: schema.photos.id,
      filename: schema.photos.filename,
      width: schema.photos.width,
      height: schema.photos.height,
      updatedAt: schema.photos.updatedAt,
      placeholder: schema.photos.placeholder,
    })
    .from(schema.photos)
    .where(and(eq(schema.photos.galleryId, gallery.id), eq(schema.photos.status, 'ready')))
    .orderBy(desc(schema.photos.createdAt))
    .all();

  return Response.json({ photos });
}
