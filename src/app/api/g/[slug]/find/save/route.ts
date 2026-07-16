import { and, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';
import type { Gallery, Visitor } from '@/db/schema';
import { errorJson, json } from '@/lib/api';
import { canViewGallery } from '@/lib/gallery-auth';
import { ipFromRequest, writeAllowed } from '@/lib/rate-limit';
import { getVisitorSession } from '@/lib/session';
import { resolveListId } from '@/lib/selection-lists';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

const MAX_IDS = 200;

async function resolveVisitor(gallery: Gallery): Promise<Visitor | Response> {
  const session = await getVisitorSession(gallery.id);
  if (!session.token) return errorJson('No visitor session', 401);

  const db = getDb();
  const existing = db
    .select()
    .from(schema.visitors)
    .where(eq(schema.visitors.sessionToken, session.token))
    .get();
  if (existing && existing.galleryId === gallery.id) return existing;

  const visitor: typeof schema.visitors.$inferInsert = {
    id: nanoid(),
    galleryId: gallery.id,
    name: null,
    email: null,
    sessionToken: session.token,
  };
  try {
    db.insert(schema.visitors).values(visitor).run();
    return visitor as Visitor;
  } catch {
    const again = db
      .select()
      .from(schema.visitors)
      .where(eq(schema.visitors.sessionToken, session.token))
      .get();
    if (again && again.galleryId === gallery.id) return again;
    return errorJson('No visitor session', 401);
  }
}

/**
 * POST { photoIds: string[], listId?: string } — save matched photos to selections
 * (magic-link / visitor favorites). Used from event/find results.
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const ip = ipFromRequest(req);
  if (!writeAllowed(`find-save:${slug}`, ip, 20, 15 * 60 * 1000)) {
    return errorJson('Too many requests', 429);
  }

  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(and(eq(schema.galleries.slug, slug), eq(schema.galleries.type, 'client')))
    .get();
  if (!gallery || !(await canViewGallery(gallery))) {
    return errorJson('Not found', 404);
  }
  if (!gallery.bibSearch && !gallery.faceSearch && !gallery.eventPage) {
    return errorJson('Not found', 404);
  }

  let body: { photoIds?: unknown; listId?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  if (!Array.isArray(body.photoIds) || body.photoIds.length === 0) {
    return errorJson('photoIds required', 400);
  }
  const photoIds = [
    ...new Set(
      body.photoIds
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .slice(0, MAX_IDS),
    ),
  ];
  if (photoIds.length === 0) return errorJson('photoIds required', 400);

  const visitor = await resolveVisitor(gallery);
  if (visitor instanceof Response) return visitor;

  const listId =
    typeof body.listId === 'string' || body.listId === null
      ? resolveListId(visitor.id, gallery.id, body.listId)
      : null;

  const valid = db
    .select({ id: schema.photos.id })
    .from(schema.photos)
    .where(
      and(
        eq(schema.photos.galleryId, gallery.id),
        eq(schema.photos.status, 'ready'),
        inArray(schema.photos.id, photoIds),
      ),
    )
    .all();

  let saved = 0;
  for (const photo of valid) {
    try {
      db.insert(schema.selections)
        .values({
          photoId: photo.id,
          visitorId: visitor.id,
          listId,
          createdAt: Date.now(),
        })
        .onConflictDoNothing()
        .run();
      saved += 1;
    } catch {
      /* ignore dup */
    }
  }

  return json({ saved, count: valid.length });
}
