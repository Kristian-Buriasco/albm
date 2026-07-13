import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';
import { errorJson, json } from '@/lib/api';
import { canViewGallery } from '@/lib/gallery-auth';
import { getVisitorSession } from '@/lib/session';

type Params = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.slug, slug))
    .get();
  if (!gallery || gallery.type !== 'client' || !(await canViewGallery(gallery))) {
    return errorJson('Not found', 404);
  }

  // Idempotent: if this browser already has a visitor for the gallery, reuse it.
  const session = await getVisitorSession(gallery.id);
  if (session.token) {
    const existing = db
      .select()
      .from(schema.visitors)
      .where(eq(schema.visitors.sessionToken, session.token))
      .get();
    if (existing && existing.galleryId === gallery.id) {
      return json({ ok: true, visitorId: existing.id });
    }
  }

  let name: string | null = null;
  let email: string | null = null;
  try {
    const body = await req.json();
    if (typeof body.name === 'string' && body.name.trim()) name = body.name.trim();
    if (typeof body.email === 'string' && body.email.trim()) email = body.email.trim();
  } catch {
    // empty body => anonymous visitor
  }

  if (gallery.clientInfoMode === 'required') {
    if (!name) return errorJson('Name is required', 400);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return errorJson('A valid email is required', 400);
    }
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorJson('Invalid email format', 400);
  }

  const token = crypto.randomBytes(24).toString('hex'); // 48 chars
  const visitor = {
    id: nanoid(),
    galleryId: gallery.id,
    name,
    email,
    sessionToken: token,
  };
  db.insert(schema.visitors).values(visitor).run();

  session.token = token;
  await session.save();
  return json({ ok: true, visitorId: visitor.id }, 201);
}
