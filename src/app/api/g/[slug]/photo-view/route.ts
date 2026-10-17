import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, readJsonObject } from '@/lib/api';
import { writeAllowed, ipFromRequest } from '@/lib/rate-limit';
import { canViewGallery } from '@/lib/gallery-auth';
import { recordPhotoView } from '@/lib/views';

type Params = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const ip = ipFromRequest(req);
  if (!writeAllowed(`photo-view:${slug}`, ip, 60, 60_000)) {
    return errorJson('Too many requests', 429);
  }

  const gallery = getDb()
    .select()
    .from(schema.galleries)
    .where(and(eq(schema.galleries.slug, slug), eq(schema.galleries.type, 'client')))
    .get();
  if (!gallery || !(await canViewGallery(gallery))) {
    return errorJson('Not found', 404);
  }

  let body: unknown;
  try {
    body = await readJsonObject(req);
  } catch {
    return errorJson('Invalid request', 400);
  }
  const photoId =
    typeof body === 'object' && body !== null && 'photoId' in body
      ? (body as { photoId: unknown }).photoId
      : null;
  if (typeof photoId !== 'string') return errorJson('Invalid request', 400);

  const photo = getDb()
    .select()
    .from(schema.photos)
    .where(and(eq(schema.photos.id, photoId), eq(schema.photos.galleryId, gallery.id)))
    .get();
  if (!photo) return errorJson('Not found', 404);

  await recordPhotoView(gallery.id, photoId, null, null);
  return json({ ok: true });
}
