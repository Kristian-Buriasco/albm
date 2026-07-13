import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json } from '@/lib/api';
import {
  clearFailures,
  ipFromRequest,
  isRateLimited,
  recordFailure,
} from '@/lib/rate-limit';
import { getGalleryAccessSession } from '@/lib/session';

type Params = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const ip = ipFromRequest(req);
  if (isRateLimited(ip)) {
    return errorJson('Too many attempts. Try again later.', 429);
  }

  const gallery = getDb()
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.slug, slug))
    .get();
  // Don't reveal existence of unknown/unpublished galleries.
  if (!gallery || !gallery.published || gallery.type !== 'client') {
    return errorJson('Not found', 404);
  }
  if (!gallery.passwordHash) return json({ ok: true });

  let password: unknown;
  try {
    ({ password } = await req.json());
  } catch {
    return errorJson('Invalid request', 400);
  }
  if (
    typeof password !== 'string' ||
    !(await bcrypt.compare(password, gallery.passwordHash))
  ) {
    recordFailure(ip);
    return errorJson('Incorrect password', 401);
  }

  clearFailures(ip);
  const session = await getGalleryAccessSession();
  const unlocked = new Set(session.unlocked ?? []);
  unlocked.add(gallery.id);
  session.unlocked = [...unlocked];
  await session.save();
  return json({ ok: true });
}
