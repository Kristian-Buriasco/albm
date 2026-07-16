import bcrypt from 'bcryptjs';
import { adminPasswordHash } from '@/lib/env';
import { isPasswordLoginEnabled } from '@/lib/admin-auth-settings';
import { issueAdminSession } from '@/lib/session';
import {
  clearFailures,
  ipFromRequest,
  isRateLimited,
  recordFailure,
  AUTH_RL,
} from '@/lib/rate-limit';
import { errorJson, json } from '@/lib/api';

const RL_SCOPE = 'admin-login';

export async function POST(req: Request) {
  const ip = ipFromRequest(req);
  if (isRateLimited(RL_SCOPE, ip, AUTH_RL)) {
    return errorJson('Too many attempts. Try again later.', 429);
  }

  if (!isPasswordLoginEnabled()) {
    recordFailure(RL_SCOPE, ip, AUTH_RL);
    return errorJson('Password login is disabled', 401);
  }

  let password: unknown;
  try {
    ({ password } = await req.json());
  } catch {
    return errorJson('Invalid request', 400);
  }
  if (typeof password !== 'string' || !adminPasswordHash()) {
    recordFailure(RL_SCOPE, ip, AUTH_RL);
    return errorJson('Invalid password', 401);
  }

  const ok = await bcrypt.compare(password, adminPasswordHash());
  if (!ok) {
    recordFailure(RL_SCOPE, ip, AUTH_RL);
    return errorJson('Invalid password', 401);
  }

  clearFailures(RL_SCOPE, ip);
  await issueAdminSession({
    userAgent: req.headers.get('user-agent'),
    ip,
  });
  return json({ ok: true });
}
