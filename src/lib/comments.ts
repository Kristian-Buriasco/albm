import crypto from 'node:crypto';
import { and, eq, or } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getDb, schema } from '@/db';
import type { Comment, Gallery } from '@/db/schema';
import { SITE_NAME } from './env';
import { galleryCommentsEnabled } from './gallery-auth';
import { getVisitorSession } from './session';

export const COMMENTER_COOKIE = 'commenter';
const YEAR_SECONDS = 365 * 24 * 60 * 60;

export type PublicComment = {
  id: string;
  authorName: string;
  body: string;
  isPhotographer: boolean;
  status: 'visible' | 'pending';
  createdAt: number;
  own: boolean;
};

export async function getCommenterToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COMMENTER_COOKIE)?.value ?? null;
}

export async function ensureCommenterToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COMMENTER_COOKIE)?.value;
  if (existing && existing.length >= 32) return existing;
  const token = crypto.randomBytes(24).toString('hex');
  store.set(COMMENTER_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: YEAR_SECONDS,
  });
  return token;
}

export async function resolveCommentIdentity(
  gallery: Gallery,
): Promise<
  | { type: 'client'; visitorId: string; authorName: string | null }
  | { type: 'portfolio'; commenterToken: string; authorName: string | null }
  | null
> {
  if (gallery.type === 'client') {
    const session = await getVisitorSession(gallery.id);
    if (!session.token) return null;
    const visitor = getDb()
      .select()
      .from(schema.visitors)
      .where(eq(schema.visitors.sessionToken, session.token))
      .get();
    if (!visitor || visitor.galleryId !== gallery.id) return null;
    return { type: 'client', visitorId: visitor.id, authorName: visitor.name };
  }
  const token = await getCommenterToken();
  if (!token) return null;
  return { type: 'portfolio', commenterToken: token, authorName: null };
}

export function commentsForPhoto(
  gallery: Gallery,
  photoId: string,
  identity: Awaited<ReturnType<typeof resolveCommentIdentity>>,
): PublicComment[] {
  if (!galleryCommentsEnabled(gallery)) return [];
  const db = getDb();
  const rows = db
    .select()
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.galleryId, gallery.id),
        eq(schema.comments.photoId, photoId),
        or(
          eq(schema.comments.status, 'visible'),
          eq(schema.comments.status, 'pending'),
        ),
      ),
    )
    .all();

  return rows
    .filter((c) => {
      if (c.status === 'visible') return true;
      return isOwnComment(c, identity);
    })
    .map((c) => ({
      id: c.id,
      authorName: c.authorName,
      body: c.body,
      isPhotographer: c.isPhotographer,
      status: c.status as 'visible' | 'pending',
      createdAt: c.createdAt,
      own: isOwnComment(c, identity),
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

function isOwnComment(
  c: Comment,
  identity: Awaited<ReturnType<typeof resolveCommentIdentity>>,
): boolean {
  if (!identity) return false;
  if (identity.type === 'client') return c.visitorId === identity.visitorId;
  return c.commenterToken === identity.commenterToken;
}

export function commentCountsForGallery(galleryId: string): Record<string, number> {
  const rows = getDb()
    .select({ photoId: schema.comments.photoId })
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.galleryId, galleryId),
        eq(schema.comments.status, 'visible'),
      ),
    )
    .all();
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.photoId] = (counts[r.photoId] ?? 0) + 1;
  return counts;
}

export function photographerAuthorName(): string {
  return SITE_NAME;
}

export function pendingCommentCount(): number {
  return (
    getDb()
      .select({ c: schema.comments.id })
      .from(schema.comments)
      .where(eq(schema.comments.status, 'pending'))
      .all().length
  );
}
