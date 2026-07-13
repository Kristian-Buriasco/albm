import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import type { Gallery, Visitor } from '@/db/schema';
import { errorJson, json } from '@/lib/api';
import { canViewGallery } from '@/lib/gallery-auth';
import { getVisitorSession } from '@/lib/session';

type Params = { params: Promise<{ slug: string }> };

async function resolveContext(
  slug: string,
): Promise<{ gallery: Gallery; visitor: Visitor } | Response> {
  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.slug, slug))
    .get();
  if (!gallery || gallery.type !== 'client' || !(await canViewGallery(gallery))) {
    return errorJson('Not found', 404);
  }
  const session = await getVisitorSession(gallery.id);
  if (!session.token) return errorJson('No visitor session', 401);
  const visitor = db
    .select()
    .from(schema.visitors)
    .where(eq(schema.visitors.sessionToken, session.token))
    .get();
  if (!visitor || visitor.galleryId !== gallery.id) {
    return errorJson('No visitor session', 401);
  }
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
  return json({ photoIds: rows.map((r) => r.photoId) });
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
