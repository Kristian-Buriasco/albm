import { requireAdmin, json } from '@/lib/api';
import { auditActionTypes, listAuditLog } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const rows = listAuditLog({ action: action || null });
  const actions = auditActionTypes();
  return json({ rows, actions });
}
