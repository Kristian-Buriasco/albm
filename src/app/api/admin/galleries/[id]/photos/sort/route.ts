import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

type SortMode = 'filename' | 'capture' | 'upload';

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
  const mode = body.mode as SortMode;
  if (mode !== 'filename' && mode !== 'capture' && mode !== 'upload') {
    return errorJson('Invalid sort mode', 400);
  }
  const sectionId =
    body.sectionId === null || typeof body.sectionId === 'string'
      ? (body.sectionId as string | null)
      : undefined;
  if (sectionId === undefined) return errorJson('sectionId required (null for whole gallery)', 400);

  const db = getDb();
  const photos = db
    .select()
    .from(schema.photos)
    .where(
      sectionId === null
        ? and(eq(schema.photos.galleryId, id), sql`${schema.photos.sectionId} IS NULL`)
        : and(eq(schema.photos.galleryId, id), eq(schema.photos.sectionId, sectionId)),
    )
    .all();

  const sorted = [...photos].sort((a, b) => {
    if (mode === 'filename') return a.filename.localeCompare(b.filename);
    if (mode === 'upload') return a.createdAt - b.createdAt;
    const ac = a.capturedAt ?? Number.MAX_SAFE_INTEGER;
    const bc = b.capturedAt ?? Number.MAX_SAFE_INTEGER;
    return ac - bc;
  });

  sorted.forEach((p, i) => {
    db.update(schema.photos)
      .set({ sortOrder: i, updatedAt: Date.now() })
      .where(eq(schema.photos.id, p.id))
      .run();
  });

  return json({ ok: true, count: sorted.length });
}

export async function GET(_req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const rows = getDb()
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.galleryId, id))
    .orderBy(asc(schema.photos.sortOrder))
    .all();
  return json(rows);
}
