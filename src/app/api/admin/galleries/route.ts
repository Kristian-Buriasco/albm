import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { title?: unknown; type?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const type = body.type === 'portfolio' ? 'portfolio' : 'client';
  if (!title) return errorJson('Title is required', 400);

  const db = getDb();
  const maxOrder =
    db
      .select({ m: sql<number>`coalesce(max(${schema.galleries.sortOrder}), 0)` })
      .from(schema.galleries)
      .get()?.m ?? 0;

  const gallery = {
    id: nanoid(),
    slug: nanoid(14),
    type: type as 'client' | 'portfolio',
    title,
    sortOrder: maxOrder + 1,
  };
  db.insert(schema.galleries).values(gallery).run();

  const row = db
    .select()
    .from(schema.galleries)
    .where(sql`${schema.galleries.id} = ${gallery.id}`)
    .get();
  return json(row, 201);
}
