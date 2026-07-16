import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { applyCreateFields } from '@/lib/gallery-fields';
import { applyGalleryDefaults } from '@/lib/gallery-defaults';
import { logAdmin } from '@/lib/audit-log';

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
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

  // Accept the same settable fields as PATCH at creation time.
  const gallery: typeof schema.galleries.$inferInsert = {
    id: nanoid(),
    slug: nanoid(14),
    type: type as 'client' | 'portfolio',
    title,
    sortOrder:
      typeof body.sortOrder === 'number' ? body.sortOrder : maxOrder + 1,
  };
  if (typeof body.password === 'string' && body.password.length > 0) {
    gallery.passwordHash = await bcrypt.hash(body.password, 10);
  }
  applyGalleryDefaults(gallery, type);
  applyCreateFields(gallery, body);
  db.insert(schema.galleries).values(gallery).run();

  logAdmin('gallery.create', {
    targetType: 'gallery',
    targetId: gallery.id,
    summary: `Created ${type} gallery "${title}"`,
  });

  const row = db
    .select()
    .from(schema.galleries)
    .where(sql`${schema.galleries.id} = ${gallery.id}`)
    .get();
  return json(row, 201);
}
