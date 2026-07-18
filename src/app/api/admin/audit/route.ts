import { requireAdmin, json } from '@/lib/api';
import { auditActionTypes, exportAuditCsv, listAuditLog, type AuditFilter } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

function parseFilter(url: URL): AuditFilter {
  const action = url.searchParams.get('action');
  const actorRaw = url.searchParams.get('actor');
  const actorType = actorRaw === 'owner' || actorRaw === 'collaborator' ? actorRaw : null;
  const days = parseInt(url.searchParams.get('days') ?? '', 10);
  const since = Number.isFinite(days) && days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : null;
  return { action: action || null, actorType, since };
}

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const url = new URL(req.url);
  const filter = parseFilter(url);

  if (url.searchParams.get('format') === 'csv') {
    const csv = exportAuditCsv(filter);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return json({ rows: listAuditLog(filter), actions: auditActionTypes() });
}
