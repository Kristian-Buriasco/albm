import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';
import type { Gallery, Visitor } from '@/db/schema';
import { errorJson, json } from '@/lib/api';
import { canViewGallery } from '@/lib/gallery-auth';
import { DEFAULT_LIST_NAME } from '@/lib/selection-constants';
import {
  createSelectionList,
  listSelectionLists,
  MAX_LISTS_PER_VISITOR,
  resolveListId,
} from '@/lib/selection-lists';
import { getVisitorSession } from '@/lib/session';
import { ipFromRequest, writeAllowed } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

async function resolveGallery(slug: string): Promise<Gallery | Response> {
  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.slug, slug))
    .get();
  if (!gallery || gallery.type !== 'client' || !(await canViewGallery(gallery))) {
    return errorJson('Not found', 404);
  }
  return gallery;
}

/** Resolve visitor from cookie; lazily persist deferred anonymous sessions. */
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

async function resolveContext(
  slug: string,
): Promise<{ gallery: Gallery; visitor: Visitor } | Response> {
  const gallery = await resolveGallery(slug);
  if (gallery instanceof Response) return gallery;
  const visitor = await resolveVisitor(gallery);
  if (visitor instanceof Response) return visitor;
  return { gallery, visitor };
}

function activeListId(
  visitorId: string,
  galleryId: string,
  queryListId: string | null,
): string | null {
  return resolveListId(visitorId, galleryId, queryListId);
}

export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const ctx = await resolveContext(slug);
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const listId = activeListId(
    ctx.visitor.id,
    ctx.gallery.id,
    url.searchParams.get('listId'),
  );

  const db = getDb();
  const where =
    listId === null
      ? and(eq(schema.selections.visitorId, ctx.visitor.id), isNull(schema.selections.listId))
      : and(eq(schema.selections.visitorId, ctx.visitor.id), eq(schema.selections.listId, listId));

  const rows = db
    .select({ photoId: schema.selections.photoId })
    .from(schema.selections)
    .where(where)
    .all();

  const lists = listSelectionLists(ctx.visitor.id, ctx.gallery.id);
  const limit =
    ctx.gallery.limitSelections && ctx.gallery.selectionLimit
      ? ctx.gallery.selectionLimit
      : null;

  return json({
    photoIds: rows.map((r) => r.photoId),
    selectionLimit: limit,
    selectionCount: rows.length,
    lists: lists.map((l) => ({ id: l.id, name: l.name })),
    activeListId: listId,
  });
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const ctx = await resolveContext(slug);
  if (ctx instanceof Response) return ctx;

  const body = await parseBody(req);
  const photoId = typeof body.photoId === 'string' ? body.photoId : null;
  if (!photoId) return errorJson('photoId required', 400);

  const listId = activeListId(
    ctx.visitor.id,
    ctx.gallery.id,
    typeof body.listId === 'string' ? body.listId : null,
  );

  const db = getDb();
  const existingWhere =
    listId === null
      ? and(eq(schema.selections.visitorId, ctx.visitor.id), isNull(schema.selections.listId))
      : and(eq(schema.selections.visitorId, ctx.visitor.id), eq(schema.selections.listId, listId));

  const existing = db
    .select({ photoId: schema.selections.photoId })
    .from(schema.selections)
    .where(existingWhere)
    .all();

  if (
    ctx.gallery.limitSelections &&
    ctx.gallery.selectionLimit &&
    existing.length >= ctx.gallery.selectionLimit
  ) {
    return errorJson(`Selection limit reached (${ctx.gallery.selectionLimit})`, 409);
  }

  const photo = db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, photoId))
    .get();
  if (!photo || photo.galleryId !== ctx.gallery.id || photo.status !== 'ready') {
    return errorJson('Photo not found', 404);
  }

  db.insert(schema.selections)
    .values({ photoId, visitorId: ctx.visitor.id, listId })
    .onConflictDoNothing()
    .run();
  return json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const { slug } = await params;
  const ctx = await resolveContext(slug);
  if (ctx instanceof Response) return ctx;

  const body = await parseBody(req);
  const photoId = typeof body.photoId === 'string' ? body.photoId : null;
  if (!photoId) return errorJson('photoId required', 400);

  const listId = activeListId(
    ctx.visitor.id,
    ctx.gallery.id,
    typeof body.listId === 'string' ? body.listId : null,
  );

  const db = getDb();
  const conditions = [
    eq(schema.selections.photoId, photoId),
    eq(schema.selections.visitorId, ctx.visitor.id),
  ];
  if (listId === null) {
    conditions.push(isNull(schema.selections.listId));
  } else {
    conditions.push(eq(schema.selections.listId, listId));
  }

  db.delete(schema.selections).where(and(...conditions)).run();
  return json({ ok: true });
}

/** Create a named selection list (max 5 per visitor/gallery). */
export async function PUT(req: Request, { params }: Params) {
  const { slug } = await params;
  const ctx = await resolveContext(slug);
  if (ctx instanceof Response) return ctx;

  const ip = ipFromRequest(req);
  if (!writeAllowed('selection-list-create', ip, 20, 15 * 60 * 1000)) {
    return errorJson('Too many requests', 429);
  }

  const body = await parseBody(req);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return errorJson('name required', 400);
  if (name === DEFAULT_LIST_NAME) return errorJson('Reserved name', 400);

  const list = createSelectionList(ctx.visitor.id, ctx.gallery.id, name);
  if (!list) {
    return errorJson(`Maximum ${MAX_LISTS_PER_VISITOR} lists per gallery`, 409);
  }
  return json({ id: list.id, name: list.name }, 201);
}
