import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';
import type { Gallery, Visitor } from '@/db/schema';
import { errorJson, json } from '@/lib/api';
import { canViewGallery } from '@/lib/gallery-auth';
import { getVisitorSession } from '@/lib/session';

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

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const ctx = await resolveContext(slug);
  if (ctx instanceof Response) return ctx;

  const rows = getDb()
    .select({ photoId: schema.selections.photoId })
    .from(schema.selections)
    .where(eq(schema.selections.visitorId, ctx.visitor.id))
    .all();
  const limit =
    ctx.gallery.limitSelections && ctx.gallery.selectionLimit
      ? ctx.gallery.selectionLimit
      : null;
  return json({
    photoIds: rows.map((r) => r.photoId),
    selectionLimit: limit,
    selectionCount: rows.length,
  });
}

async function parsePhotoId(req: Request): Promise<string | null> {
  try {
    const body = await req.json();
    return typeof body.photoId === 'string' ? body.photoId : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const ctx = await resolveContext(slug);
  if (ctx instanceof Response) return ctx;

  const photoId = await parsePhotoId(req);
  if (!photoId) return errorJson('photoId required', 400);

  const db = getDb();
  const existing = db
    .select({ photoId: schema.selections.photoId })
    .from(schema.selections)
    .where(eq(schema.selections.visitorId, ctx.visitor.id))
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
    .values({ photoId, visitorId: ctx.visitor.id })
    .onConflictDoNothing()
    .run();
  return json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const { slug } = await params;
  const ctx = await resolveContext(slug);
  if (ctx instanceof Response) return ctx;

  const photoId = await parsePhotoId(req);
  if (!photoId) return errorJson('photoId required', 400);

  getDb()
    .delete(schema.selections)
    .where(
      and(
        eq(schema.selections.photoId, photoId),
        eq(schema.selections.visitorId, ctx.visitor.id),
      ),
    )
    .run();
  return json({ ok: true });
}
