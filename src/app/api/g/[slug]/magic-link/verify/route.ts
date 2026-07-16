import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json } from '@/lib/api';
import { canViewGallery, needsAccessGate } from '@/lib/gallery-auth';
import { linkVisitorToAccount, verifyMagicLink } from '@/lib/magic-links';
import { getVisitorSession, hasGalleryAccess, isAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return errorJson('token required', 400);

  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.slug, slug))
    .get();
  if (!gallery || gallery.type !== 'client' || !(await canViewGallery(gallery))) {
    return errorJson('Not found', 404);
  }

  const admin = await isAdmin();
  if (!admin && needsAccessGate(gallery) && !(await hasGalleryAccess(gallery.id))) {
    return errorJson('Forbidden', 403);
  }

  const result = verifyMagicLink(token, gallery.id);
  if (!result.ok) return errorJson('Invalid or expired link', 401);

  const session = await getVisitorSession(gallery.id);
  const sessionToken = session.token ?? crypto.randomBytes(24).toString('hex');

  await linkVisitorToAccount(gallery.id, result.accountId, sessionToken, async (tok) => {
    session.token = tok;
    await session.save();
  });

  return json({ ok: true });
}
