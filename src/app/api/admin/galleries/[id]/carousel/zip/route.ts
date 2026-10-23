import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, requireOwner } from '@/lib/api';
import { MAX_SLIDES, renderSlide } from '@/lib/carousel';
import { streamZip } from '@/lib/zip-stream';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** ?ids=a,b,c (carousel order) &fit=crop|pad -> zip of 01.jpg.. at 1080x1350. */
export async function GET(req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  const url = new URL(req.url);
  const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, MAX_SLIDES);
  const fit = url.searchParams.get('fit') === 'pad' ? 'pad' : 'crop';
  const gallery = getDb().select().from(schema.galleries).where(eq(schema.galleries.id, id)).get();
  if (!gallery) return errorJson('Not found', 404);
  const rows = getDb().select().from(schema.photos).where(eq(schema.photos.galleryId, id)).all();
  const byId = new Map(rows.map((p) => [p.id, p]));
  const photos = ids.map((x) => byId.get(x)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (!photos.length) return errorJson('No photos', 400);

  async function* entries() {
    for (const [i, p] of photos.entries()) {
      yield { name: `${String(i + 1).padStart(2, '0')}.jpg`, body: await renderSlide(id, p.filename, fit) };
    }
  }
  const name = `${gallery.slug || 'gallery'}-instagram.zip`.replace(/[^\w.-]/g, '_');
  return new Response(streamZip(entries()), {
    headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' },
  });
}
