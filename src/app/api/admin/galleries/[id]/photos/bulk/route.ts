import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { deletePhotoById } from '@/lib/delete-photo';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  const photoIds = Array.isArray(body.photoIds)
    ? body.photoIds.filter((x): x is string => typeof x === 'string')
    : [];
  const action = body.action as string;
  if (photoIds.length === 0) return errorJson('photoIds required', 400);

  const db = getDb();
  const photos = db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.galleryId, id))
    .all();
  const valid = new Set(photos.map((p) => p.id));
  if (!photoIds.every((pid) => valid.has(pid))) {
    return errorJson('Invalid photo id', 400);
  }

  if (action === 'delete') {
    let deleted = 0;
    for (const pid of photoIds) {
      if (deletePhotoById(pid)) deleted++;
    }
    return json({ ok: true, deleted });
  }

  if (action === 'move') {
    const sectionId =
      body.sectionId === null || typeof body.sectionId === 'string'
        ? (body.sectionId as string | null)
        : undefined;
    if (sectionId === undefined) return errorJson('sectionId required', 400);
    if (sectionId) {
      const sec = db.select().from(schema.sections).where(eq(schema.sections.id, sectionId)).get();
      if (!sec || sec.galleryId !== id) return errorJson('Section not found', 404);
    }
    for (const pid of photoIds) {
      db.update(schema.photos)
        .set({ sectionId, updatedAt: Date.now() })
        .where(eq(schema.photos.id, pid))
        .run();
    }
    return json({ ok: true, moved: photoIds.length });
  }

  if (action === 'cover') {
    if (photoIds.length !== 1) return errorJson('Select exactly one photo for cover', 400);
    db.update(schema.galleries)
      .set({ coverPhotoId: photoIds[0], updatedAt: Date.now() })
      .where(eq(schema.galleries.id, id))
      .run();
    return json({ ok: true, coverPhotoId: photoIds[0] });
  }

  return errorJson('Unknown action', 400);
}
