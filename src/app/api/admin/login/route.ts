import bcrypt from 'bcryptjs';
import { ADMIN_PASSWORD_HASH } from '@/lib/env';
import { getAdminSession } from '@/lib/session';
import {
  clearFailures,
  ipFromRequest,
  isRateLimited,
  recordFailure,
} from '@/lib/rate-limit';
import { errorJson, json } from '@/lib/api';

export async function POST(req: Request) {
  const ip = ipFromRequest(req);
  if (isRateLimited(ip)) {
    return errorJson('Too many attempts. Try again later.', 429);
  }

  let password: unknown;
  try {
    ({ password } = await req.json());
  } catch {
    return errorJson('Invalid request', 400);
  }
  if (typeof password !== 'string' || !ADMIN_PASSWORD_HASH) {
    recordFailure(ip);
    return errorJson('Invalid password', 401);
  }

  const ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!ok) {
    recordFailure(ip);
    return errorJson('Invalid password', 401);
  }

  clearFailures(ip);
  const session = await getAdminSession();
  session.isAdmin = true;
  await session.save();
  return json({ ok: true });
}
