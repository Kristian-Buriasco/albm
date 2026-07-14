import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';

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
  if (body.status !== 'visible' && body.status !== 'hidden') {
    return errorJson('Invalid status', 400);
  }

  const db = getDb();
  const comment = db.select().from(schema.comments).where(eq(schema.comments.id, id)).get();
  if (!comment) return errorJson('Not found', 404);

  db.update(schema.comments).set({ status: body.status }).where(eq(schema.comments.id, id)).run();
  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  getDb()
    .update(schema.comments)
    .set({ status: 'hidden' })
    .where(eq(schema.comments.id, id))
    .run();
  return json({ ok: true });
}
