import { asc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const rows = getDb()
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.galleryId, id))
    .orderBy(asc(schema.sections.sortOrder))
    .all();
  return json(rows);
}

export async function POST(req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const db = getDb();
  const gallery = db.select().from(schema.galleries).where(eq(schema.galleries.id, id)).get();
  if (!gallery) return errorJson('Not found', 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  if (!title) return errorJson('Title required', 400);

  const maxOrder =
    db
      .select({ m: sql<number>`coalesce(max(${schema.sections.sortOrder}), 0)` })
      .from(schema.sections)
      .where(eq(schema.sections.galleryId, id))
      .get()?.m ?? 0;

  const section = {
    id: nanoid(),
    galleryId: id,
    title,
    sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : maxOrder + 1,
  };
  db.insert(schema.sections).values(section).run();
  return json(section, 201);
}

export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  const sectionId = typeof body.sectionId === 'string' ? body.sectionId : '';
  if (!sectionId) return errorJson('sectionId required', 400);

  const db = getDb();
  const section = db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.id, sectionId))
    .get();
  if (!section || section.galleryId !== id) return errorJson('Not found', 404);

  const updates: Partial<typeof schema.sections.$inferInsert> = {};
  if (typeof body.title === 'string' && body.title.trim()) {
    updates.title = body.title.trim().slice(0, 120);
  }
  if (typeof body.sortOrder === 'number') updates.sortOrder = body.sortOrder;
  if (Object.keys(updates).length === 0) return errorJson('Nothing to update', 400);

  db.update(schema.sections).set(updates).where(eq(schema.sections.id, sectionId)).run();
  return json(db.select().from(schema.sections).where(eq(schema.sections.id, sectionId)).get());
}

export async function DELETE(req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  const sectionId = typeof body.sectionId === 'string' ? body.sectionId : '';
  if (!sectionId) return errorJson('sectionId required', 400);

  const db = getDb();
  const section = db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.id, sectionId))
    .get();
  if (!section || section.galleryId !== id) return errorJson('Not found', 404);

  db.update(schema.photos)
    .set({ sectionId: null, updatedAt: Date.now() })
    .where(eq(schema.photos.sectionId, sectionId))
    .run();
  db.delete(schema.sections).where(eq(schema.sections.id, sectionId)).run();
  return json({ ok: true });
}

export async function PUT(req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  if (!Array.isArray(body)) return errorJson('Expected array of section ids', 400);

  const db = getDb();
  body.forEach((sectionId, i) => {
    if (typeof sectionId !== 'string') return;
    db.update(schema.sections)
      .set({ sortOrder: i })
      .where(eq(schema.sections.id, sectionId))
      .run();
  });
  return json({ ok: true });
}
