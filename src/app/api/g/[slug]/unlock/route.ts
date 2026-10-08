import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json } from '@/lib/api';
import {
  AUTH_RL,
  clearFailures,
  ipFromRequest,
  isRateLimited,
  pinRateLimitOpts,
  recordFailure,
  writeAllowed,
} from '@/lib/rate-limit';
import { galleryUsesPin, verifyPin } from '@/lib/pin';
import { isGalleryExpired } from '@/lib/downloads';
import { galleryAccessToken, getGalleryAccessSession } from '@/lib/session';

type Params = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const ip = ipFromRequest(req);

  const gallery = getDb()
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.slug, slug))
    .get();
  if (
    !gallery ||
    !gallery.published ||
    gallery.type !== 'client' ||
    isGalleryExpired(gallery)
  ) {
    return errorJson('Not found', 404);
  }

  const usePin = galleryUsesPin(gallery);
  const scope = usePin ? `gallery-pin:${slug}` : 'gallery-unlock';
  const rlOpts = usePin ? pinRateLimitOpts(slug) : AUTH_RL;

  if (isRateLimited(scope, ip, { ...rlOpts, logLabel: scope })) {
    return errorJson('Too many attempts. Try again later.', 429);
  }

  if (!usePin && !gallery.passwordHash) return json({ ok: true });
  if (usePin && !gallery.pinHash) return json({ ok: true });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  let ok = false;
  if (usePin) {
    const pin = typeof body.pin === 'string' ? body.pin : '';
    if (pin && gallery.pinHash) ok = await verifyPin(pin, gallery.pinHash);
  } else {
    const password = typeof body.password === 'string' ? body.password : '';
    if (password && gallery.passwordHash) {
      ok = await bcrypt.compare(password, gallery.passwordHash);
    }
  }

  if (!ok) {
    recordFailure(scope, ip, rlOpts);
    return errorJson(usePin ? 'Incorrect PIN' : 'Incorrect password', 401);
  }

  clearFailures(scope, ip);
  const session = await getGalleryAccessSession();
  // Drop stale entries for this gallery (older credentials) before adding the
  // current fingerprint; legacy bare-ID entries are discarded here too.
  const unlocked = new Set(
    (session.unlocked ?? []).filter((t) => !t.startsWith(`${gallery.id}.`) && t !== gallery.id),
  );
  unlocked.add(galleryAccessToken(gallery));
  session.unlocked = [...unlocked];
  await session.save();
  return json({ ok: true });
}

export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const ip = ipFromRequest(req);
  if (!writeAllowed('gallery-mode', ip, 60, 60_000)) {
    return errorJson('Too many requests', 429);
  }
  const gallery = getDb()
    .select({
      published: schema.galleries.published,
      type: schema.galleries.type,
      passwordHash: schema.galleries.passwordHash,
      pinEnabled: schema.galleries.pinEnabled,
      pinHash: schema.galleries.pinHash,
    })
    .from(schema.galleries)
    .where(eq(schema.galleries.slug, slug))
    .get();
  if (!gallery || !gallery.published || gallery.type !== 'client') {
    return errorJson('Not found', 404);
  }
  const mode = galleryUsesPin(gallery)
    ? 'pin'
    : gallery.passwordHash
      ? 'password'
      : 'none';
  return json({ mode });
}
