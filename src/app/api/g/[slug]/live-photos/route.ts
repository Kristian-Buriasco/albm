import { and, gt, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json } from '@/lib/api';
import { canViewGallery } from '@/lib/gallery-auth';
import { buildSectionPayloads } from '@/lib/gallery-page-data';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/** Poll endpoint for live galleries — returns ready photos newer than `since`. */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(and(eq(schema.galleries.slug, slug), eq(schema.galleries.type, 'client')))
    .get();
  if (!gallery || !gallery.autoPublishOnUpload) {
    return errorJson('Not found', 404);
  }
  if (!(await canViewGallery(gallery))) {
    return errorJson('Not found', 404);
  }

  const sinceRaw = new URL(req.url).searchParams.get('since');
  const since = sinceRaw ? Number(sinceRaw) : 0;
  if (!Number.isFinite(since) || since < 0) {
    return errorJson('Invalid since', 400);
  }

  const photos = db
    .select()
    .from(schema.photos)
    .where(
      and(
        eq(schema.photos.galleryId, gallery.id),
        eq(schema.photos.status, 'ready'),
        gt(schema.photos.createdAt, since),
      ),
    )
    .all();

  const sectionsDb = db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.galleryId, gallery.id))
    .all();

  const payloads = buildSectionPayloads(gallery, photos, sectionsDb);
  const flat = payloads.flatMap((s) => s.photos);

  return json({
    photos: flat,
    serverTime: Date.now(),
    live: true,
  });
}
