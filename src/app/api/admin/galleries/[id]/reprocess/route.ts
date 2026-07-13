import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { reprocessPhoto } from '@/lib/queue';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, id))
    .get();
  if (!gallery) return errorJson('Not found', 404);

  const photoRows = db
    .select({ id: schema.photos.id })
    .from(schema.photos)
    .where(eq(schema.photos.galleryId, id))
    .all();
  for (const p of photoRows) reprocessPhoto(p.id);

  return json({ ok: true, count: photoRows.length });
}
