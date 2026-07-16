import { errorJson, json, requireAdmin } from '@/lib/api';
import { logAdmin } from '@/lib/audit-log';
import {
  listActiveAdminSessions,
  revokeAdminSession,
  revokeOtherAdminSessions,
} from '@/lib/admin-sessions';
import { getAdminSessionId } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const currentId = await getAdminSessionId();
  const sessions = listActiveAdminSessions().map((s) => ({
    ...s,
    isCurrent: s.id === currentId,
  }));
  return json({ sessions, currentId });
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  const currentId = await getAdminSessionId();
  if (!currentId) return errorJson('Unauthorized', 401);

  if (body.revokeAllOthers === true) {
    const count = revokeOtherAdminSessions(currentId);
    logAdmin('admin_session.revoke_others', {
      targetType: 'admin_session',
      targetId: currentId,
      summary: `Revoked ${count} other admin session(s)`,
    });
    return json({ ok: true, revoked: count });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return errorJson('id required', 400);
  if (id === currentId) return errorJson('Cannot revoke current session here; use logout', 400);

  const ok = revokeAdminSession(id);
  if (!ok) return errorJson('Not found', 404);

  logAdmin('admin_session.revoke', {
    targetType: 'admin_session',
    targetId: id,
    summary: 'Revoked admin session',
  });
  return json({ ok: true });
}
