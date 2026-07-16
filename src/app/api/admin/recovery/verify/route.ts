import {
  clearFailures,
  ipFromRequest,
  isRateLimited,
  recordFailure,
} from '@/lib/rate-limit';
import { errorJson, json } from '@/lib/api';
import { verifyRecoveryCode } from '@/lib/recovery-codes';
import { issueAdminSession } from '@/lib/session';

const RL_SCOPE = 'admin-recovery-verify';
const CODE_MAX = 32;

export async function POST(req: Request) {
  const ip = ipFromRequest(req);
  if (isRateLimited(RL_SCOPE, ip)) {
    return errorJson('Too many attempts. Try again later.', 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    recordFailure(RL_SCOPE, ip);
    return errorJson('Invalid request', 400);
  }

  const code =
    typeof body === 'object' && body !== null && 'code' in body
      ? (body as { code: unknown }).code
      : null;

  if (typeof code !== 'string' || code.length === 0 || code.length > CODE_MAX) {
    recordFailure(RL_SCOPE, ip);
    return errorJson('Invalid recovery code', 401);
  }

  const ok = await verifyRecoveryCode(code);
  if (!ok) {
    recordFailure(RL_SCOPE, ip);
    return errorJson('Invalid recovery code', 401);
  }

  clearFailures(RL_SCOPE, ip);
  await issueAdminSession({
    userAgent: req.headers.get('user-agent'),
    ip,
  });
  return json({ ok: true });
}
