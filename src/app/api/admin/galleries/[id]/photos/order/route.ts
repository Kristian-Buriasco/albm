import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  let ids: unknown;
  try {
    ids = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) {
    return errorJson('Expected an array of photo IDs', 400);
  }

  const db = getDb();
  const now = Date.now();
  for (let i = 0; i < ids.length; i++) {
    db.update(schema.photos)
      .set({ sortOrder: i + 1, updatedAt: now })
      .where(and(eq(schema.photos.id, ids[i]), eq(schema.photos.galleryId, id)))
      .run();
  }
  return json({ ok: true });
}
