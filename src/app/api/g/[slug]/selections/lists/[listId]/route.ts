import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import type { Gallery, Visitor } from '@/db/schema';
import { errorJson, json } from '@/lib/api';
import { canViewGallery } from '@/lib/gallery-auth';
import { deleteSelectionList } from '@/lib/selection-lists';
import { getVisitorSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string; listId: string }> };

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
  if (!visitor || visitor.galleryId !== gallery.id) return errorJson('No visitor session', 401);

  return { gallery, visitor };
}

/** Delete one of the visitor's own named selection lists (and its selections, via FK cascade). */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug, listId } = await params;
  const ctx = await resolveContext(slug);
  if (ctx instanceof Response) return ctx;

  const deleted = deleteSelectionList(ctx.visitor.id, ctx.gallery.id, listId);
  if (!deleted) return errorJson('Not found', 404);
  return json({ ok: true });
}
