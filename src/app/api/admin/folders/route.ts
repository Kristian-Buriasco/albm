import { asc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { logAdmin } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const rows = getDb()
    .select()
    .from(schema.galleryFolders)
    .orderBy(asc(schema.galleryFolders.sortOrder), asc(schema.galleryFolders.createdAt))
    .all();
  return json({ folders: rows });
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (!name) return errorJson('Name required', 400);

  const db = getDb();
  const maxOrder =
    db
      .select({ m: sql<number>`coalesce(max(${schema.galleryFolders.sortOrder}), 0)` })
      .from(schema.galleryFolders)
      .get()?.m ?? 0;

  const folder = {
    id: nanoid(),
    name,
    sortOrder: maxOrder + 1,
  };
  db.insert(schema.galleryFolders).values(folder).run();

  logAdmin('folder.create', {
    targetType: 'folder',
    targetId: folder.id,
    summary: `Created folder "${name}"`,
  });

  return json(folder, 201);
}

export async function PUT(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  if (!Array.isArray(body)) return errorJson('Expected array of folder ids', 400);

  const db = getDb();
  body.forEach((folderId, i) => {
    if (typeof folderId !== 'string') return;
    db.update(schema.galleryFolders)
      .set({ sortOrder: i })
      .where(eq(schema.galleryFolders.id, folderId))
      .run();
  });
  return json({ ok: true });
}
