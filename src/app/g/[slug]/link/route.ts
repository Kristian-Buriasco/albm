import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb, schema } from '@/db';
import { canViewGallery, needsAccessGate } from '@/lib/gallery-auth';
import { linkVisitorToAccount, verifyMagicLink } from '@/lib/magic-links';
import { getVisitorSession, hasGalleryAccess, isAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const token = new URL(req.url).searchParams.get('token');
  const base = new URL(req.url);
  if (!token) {
    return NextResponse.redirect(new URL(`/g/${slug}`, base));
  }

  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(and(eq(schema.galleries.slug, slug), eq(schema.galleries.type, 'client')))
    .get();
  if (!gallery || !gallery.published) {
    return NextResponse.redirect(new URL(`/g/${slug}`, base));
  }

  const admin = await isAdmin();
  if (!admin && needsAccessGate(gallery) && !(await hasGalleryAccess(gallery.id))) {
    return NextResponse.redirect(new URL(`/g/${slug}`, base));
  }
  if (!(await canViewGallery(gallery))) {
    return NextResponse.redirect(new URL(`/g/${slug}`, base));
  }

  const result = verifyMagicLink(token, gallery.id);
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/g/${slug}?link=invalid`, base));
  }

  const session = await getVisitorSession(gallery.id);
  const sessionToken = session.token ?? crypto.randomBytes(24).toString('hex');

  await linkVisitorToAccount(gallery.id, result.accountId, sessionToken, async (tok) => {
    session.token = tok;
    await session.save();
  });

  return NextResponse.redirect(new URL(`/g/${slug}?linked=1`, base));
}
