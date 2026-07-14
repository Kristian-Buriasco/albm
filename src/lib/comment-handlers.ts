import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getDb, schema } from '@/db';
import type { Gallery } from '@/db/schema';
import { errorJson, json } from '@/lib/api';
import {
  commentsForPhoto,
  ensureCommenterToken,
  resolveCommentIdentity,
} from '@/lib/comments';
import { canViewGallery, galleryCommentsEnabled } from '@/lib/gallery-auth';
import { ipFromRequest, writeAllowed } from '@/lib/rate-limit';
import { getVisitorSession } from '@/lib/session';

const COMMENT_WRITE_MAX = 20;
const COMMENT_WRITE_WINDOW_MS = 10 * 60 * 1000;
const COMMENTER_NAME_COOKIE = 'commenter_name';

async function resolveGallery(
  slug: string,
  type: 'client' | 'portfolio',
): Promise<Gallery | Response> {
  const gallery = getDb()
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.slug, slug))
    .get();
  if (!gallery || gallery.type !== type || !(await canViewGallery(gallery))) {
    return errorJson('Not found', 404);
  }
  if (!galleryCommentsEnabled(gallery)) return errorJson('Not found', 404);
  return gallery;
}

export async function handleCommentGet(
  req: Request,
  slug: string,
  galleryType: 'client' | 'portfolio',
): Promise<Response> {
  const gallery = await resolveGallery(slug, galleryType);
  if (gallery instanceof Response) return gallery;

  const photoId = new URL(req.url).searchParams.get('photoId');
  if (!photoId) return errorJson('photoId required', 400);

  const photo = getDb()
    .select()
    .from(schema.photos)
    .where(and(eq(schema.photos.id, photoId), eq(schema.photos.galleryId, gallery.id)))
    .get();
  if (!photo || photo.status !== 'ready') return errorJson('Not found', 404);

  const identity = await resolveCommentIdentity(gallery);
  const store = await cookies();
  const prefilledName =
    gallery.type === 'portfolio'
      ? (store.get(COMMENTER_NAME_COOKIE)?.value ?? '')
      : (identity?.type === 'client' ? identity.authorName : null) ?? '';

  return json({
    comments: commentsForPhoto(gallery, photoId, identity),
    prefilledName,
  });
}

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function handleCommentPost(
  req: Request,
  slug: string,
  galleryType: 'client' | 'portfolio',
): Promise<Response> {
  if (!writeAllowed('comments', ipFromRequest(req), COMMENT_WRITE_MAX, COMMENT_WRITE_WINDOW_MS)) {
    return errorJson('Too many requests', 429);
  }

  const gallery = await resolveGallery(slug, galleryType);
  if (gallery instanceof Response) return gallery;

  const body = await parseBody(req);
  const photoId = typeof body?.photoId === 'string' ? body.photoId : null;
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  let name = typeof body?.name === 'string' ? body.name.trim() : '';

  if (!photoId) return errorJson('photoId required', 400);
  if (!text) return errorJson('Comment required', 400);
  if (text.length > 2000) return errorJson('Comment too long', 400);
  if (name.length > 80) return errorJson('Name too long', 400);

  const photo = getDb()
    .select()
    .from(schema.photos)
    .where(and(eq(schema.photos.id, photoId), eq(schema.photos.galleryId, gallery.id)))
    .get();
  if (!photo || photo.status !== 'ready') return errorJson('Not found', 404);

  const db = getDb();
  const status = gallery.commentsMode === 'pre' ? 'pending' : 'visible';

  if (gallery.type === 'client') {
    const session = await getVisitorSession(gallery.id);
    if (!session.token) return errorJson('No visitor session', 401);
    let visitor = db
      .select()
      .from(schema.visitors)
      .where(eq(schema.visitors.sessionToken, session.token))
      .get();
    if (visitor && visitor.galleryId !== gallery.id) {
      return errorJson('No visitor session', 401);
    }
    // Deferred anonymous visitors (info gate off/skipped, haven't selected yet)
    // have a session token but no row — create it lazily, like the selections route.
    if (!visitor) {
      if (!name) return errorJson('Name required', 400);
      const created: typeof schema.visitors.$inferInsert = {
        id: nanoid(),
        galleryId: gallery.id,
        name,
        email: null,
        sessionToken: session.token,
      };
      try {
        db.insert(schema.visitors).values(created).run();
        visitor = created as typeof schema.visitors.$inferSelect;
      } catch {
        const again = db
          .select()
          .from(schema.visitors)
          .where(eq(schema.visitors.sessionToken, session.token))
          .get();
        if (!again || again.galleryId !== gallery.id) {
          return errorJson('No visitor session', 401);
        }
        visitor = again;
      }
    }
    if (!visitor.name && !name) return errorJson('Name required', 400);
    if (!visitor.name && name) {
      db.update(schema.visitors)
        .set({ name, updatedAt: Date.now() })
        .where(eq(schema.visitors.id, visitor.id))
        .run();
      visitor = { ...visitor, name };
    }
    const authorName = visitor.name ?? name;
    const comment = {
      id: nanoid(),
      galleryId: gallery.id,
      photoId,
      visitorId: visitor.id,
      commenterToken: null,
      authorName,
      body: text,
      isPhotographer: false,
      status: status as 'visible' | 'pending',
    };
    db.insert(schema.comments).values(comment).run();
    return json({ ok: true, comment: { ...comment, own: true } }, 201);
  }

  const token = await ensureCommenterToken();
  const store = await cookies();
  const savedName = store.get(COMMENTER_NAME_COOKIE)?.value ?? '';
  if (!name && savedName) name = savedName;
  if (!name) return errorJson('Name required', 400);

  store.set(COMMENTER_NAME_COOKIE, name, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });

  const comment = {
    id: nanoid(),
    galleryId: gallery.id,
    photoId,
    visitorId: null,
    commenterToken: token,
    authorName: name,
    body: text,
    isPhotographer: false,
    status: status as 'visible' | 'pending',
  };
  db.insert(schema.comments).values(comment).run();
  return json({ ok: true, comment: { ...comment, own: true } }, 201);
}

export async function handleCommentDelete(
  req: Request,
  slug: string,
  galleryType: 'client' | 'portfolio',
): Promise<Response> {
  const gallery = await resolveGallery(slug, galleryType);
  if (gallery instanceof Response) return gallery;

  const body = await parseBody(req);
  const commentId = typeof body?.commentId === 'string' ? body.commentId : null;
  if (!commentId) return errorJson('commentId required', 400);

  const db = getDb();
  const comment = db.select().from(schema.comments).where(eq(schema.comments.id, commentId)).get();
  if (!comment || comment.galleryId !== gallery.id) return errorJson('Not found', 404);

  const identity = await resolveCommentIdentity(gallery);
  if (!identity) return errorJson('Forbidden', 403);
  const own =
    identity.type === 'client'
      ? comment.visitorId === identity.visitorId
      : comment.commenterToken === identity.commenterToken;
  if (!own || comment.isPhotographer) return errorJson('Forbidden', 403);

  db.update(schema.comments)
    .set({ status: 'hidden' })
    .where(eq(schema.comments.id, commentId))
    .run();
  return json({ ok: true });
}
