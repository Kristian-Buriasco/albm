import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireOwner } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Enable/disable kiosk mode (owner-only). Enabling generates a stable
 * `kioskToken` if one doesn't already exist (kept for a future deep-link /
 * rotate flow); disabling only flips the flag, leaving the token in place
 * so re-enabling doesn't churn it.
 */
export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;

  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, id))
    .get();
  if (!gallery) return errorJson('Not found', 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  if (typeof body.enabled !== 'boolean') {
    return errorJson('Invalid request', 400);
  }

  const updates: Partial<typeof schema.galleries.$inferInsert> = {
    kioskEnabled: body.enabled,
    updatedAt: Date.now(),
  };
  if (body.enabled && !gallery.kioskToken) {
    updates.kioskToken = nanoid();
  }

  db.update(schema.galleries).set(updates).where(eq(schema.galleries.id, id)).run();

  const updated = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, id))
    .get();

  return json({ ok: true, kioskEnabled: updated?.kioskEnabled ?? false, kioskToken: updated?.kioskToken ?? null });
}
