import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json } from '@/lib/api';
import { canViewGallery } from '@/lib/gallery-auth';
import { logAdmin } from '@/lib/audit-log';
import { findOrCreateAccount, issueMagicLink, normalizeEmail } from '@/lib/magic-links';
import { BASE_URL } from '@/lib/env';
import { ipFromRequest, writeAllowed } from '@/lib/rate-limit';
import { getVisitorSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

const ISSUE_MAX_IP = 5;
const ISSUE_MAX_EMAIL = 5;
const ISSUE_WINDOW = 15 * 60 * 1000;

async function visitorFromSession(galleryId: string) {
  const session = await getVisitorSession(galleryId);
  if (!session.token) return null;
  return getDb()
    .select()
    .from(schema.visitors)
    .where(eq(schema.visitors.sessionToken, session.token))
    .get() ?? null;
}

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const ip = ipFromRequest(req);

  if (!writeAllowed('magic-link-ip', ip, ISSUE_MAX_IP, ISSUE_WINDOW)) {
    return errorJson('Too many requests', 429);
  }

  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.slug, slug))
    .get();
  if (!gallery || gallery.type !== 'client' || !(await canViewGallery(gallery))) {
    return errorJson('Not found', 404);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorJson('Valid email required', 400);
  }

  if (!writeAllowed(`magic-link-email:${email}`, ip, ISSUE_MAX_EMAIL, ISSUE_WINDOW)) {
    return errorJson('Too many requests', 429);
  }

  const account = findOrCreateAccount(email);
  const visitor = await visitorFromSession(gallery.id);
  if (visitor && visitor.galleryId === gallery.id) {
    db.update(schema.visitors)
      .set({ email, updatedAt: Date.now() })
      .where(eq(schema.visitors.id, visitor.id))
      .run();
  }

  const { rawToken, expiresAt } = issueMagicLink(account.id, gallery.id);
  const url = `${BASE_URL}/g/${slug}/link?token=${encodeURIComponent(rawToken)}`;

  logAdmin('magic_link.issue', {
    targetType: 'gallery',
    targetId: gallery.id,
    summary: `Issued magic link for gallery "${gallery.title}"`,
  });

  return json({ url, expiresAt });
}
