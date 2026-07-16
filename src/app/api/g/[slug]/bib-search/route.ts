import { and, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json } from '@/lib/api';
import { canViewGallery } from '@/lib/gallery-auth';
import { ipFromRequest, writeAllowed } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

const MAX_BIB_LEN = 6;

/**
 * GET /api/g/[slug]/bib-search?number=42
 * Returns photo IDs matching the bib. Respects gallery access — no PIN/password bypass.
 */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const ip = ipFromRequest(req);
  if (!writeAllowed(`bib-search:${slug}`, ip, 60, 60_000)) {
    return errorJson('Too many requests', 429);
  }

  const url = new URL(req.url);
  const raw = (url.searchParams.get('number') ?? '').trim();
  if (!/^\d{1,6}$/.test(raw)) {
    return errorJson('Enter a bib number (1–6 digits)', 400);
  }
  const number = raw.replace(/^0+/, '') || '0';
  if (number === '0' || number.length > MAX_BIB_LEN) {
    return errorJson('Enter a bib number (1–6 digits)', 400);
  }

  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(and(eq(schema.galleries.slug, slug), eq(schema.galleries.type, 'client')))
    .get();
  if (!gallery || !(await canViewGallery(gallery))) {
    return errorJson('Not found', 404);
  }
  if (!gallery.bibSearch) {
    return errorJson('Bib search is not enabled', 404);
  }

  const bibRows = db
    .select({ photoId: schema.photoBibs.photoId })
    .from(schema.photoBibs)
    .where(
      and(eq(schema.photoBibs.galleryId, gallery.id), eq(schema.photoBibs.number, number)),
    )
    .all();
  const ids = [...new Set(bibRows.map((r) => r.photoId))];
  if (ids.length === 0) {
    return json({ number, photoIds: [], count: 0 });
  }

  const ready = db
    .select({ id: schema.photos.id })
    .from(schema.photos)
    .where(
      and(
        eq(schema.photos.galleryId, gallery.id),
        eq(schema.photos.status, 'ready'),
        inArray(schema.photos.id, ids),
      ),
    )
    .all();

  return json({
    number,
    photoIds: ready.map((p) => p.id),
    count: ready.length,
    // Never assert identity — client copy uses "photos matching #N"
    label: `photos matching #${number}`,
  });
}
