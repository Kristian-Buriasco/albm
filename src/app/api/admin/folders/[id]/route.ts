import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { logAdmin } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

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

  const db = getDb();
  const folder = db
    .select()
    .from(schema.galleryFolders)
    .where(eq(schema.galleryFolders.id, id))
    .get();
  if (!folder) return errorJson('Not found', 404);

  const updates: Partial<typeof schema.galleryFolders.$inferInsert> = {};
  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim().slice(0, 120);
  }
  if (Object.keys(updates).length === 0) return errorJson('Nothing to update', 400);

  db.update(schema.galleryFolders).set(updates).where(eq(schema.galleryFolders.id, id)).run();
  return json(db.select().from(schema.galleryFolders).where(eq(schema.galleryFolders.id, id)).get());
}

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const db = getDb();
  const folder = db
    .select()
    .from(schema.galleryFolders)
    .where(eq(schema.galleryFolders.id, id))
    .get();
  if (!folder) return errorJson('Not found', 404);

  db.update(schema.galleries)
    .set({ folderId: null, updatedAt: Date.now() })
    .where(eq(schema.galleries.folderId, id))
    .run();
  db.delete(schema.galleryFolders).where(eq(schema.galleryFolders.id, id)).run();

  logAdmin('folder.delete', {
    targetType: 'folder',
    targetId: id,
    summary: `Deleted folder "${folder.name}"`,
  });

  return json({ ok: true });
}
