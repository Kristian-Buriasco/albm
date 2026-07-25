import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json } from '@/lib/api';
import { canViewGallery } from '@/lib/gallery-auth';
import { ipFromRequest, writeAllowed } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Params) {
  if (!writeAllowed('featured-consent', ipFromRequest(req), 10, 60 * 60 * 1000)) {
    return errorJson('Too many requests', 429);
  }

  const { slug } = await params;
  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.slug, slug))
    .get();
  if (!gallery || gallery.type !== 'client' || !(await canViewGallery(gallery))) {
    return errorJson('Not found', 404);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  if (typeof body.granted !== 'boolean') return errorJson('Invalid request', 400);

  db.update(schema.galleries)
    .set({ featuredConsent: body.granted ? 'granted' : 'declined', updatedAt: Date.now() })
    .where(eq(schema.galleries.id, gallery.id))
    .run();

  return json({ ok: true });
}
