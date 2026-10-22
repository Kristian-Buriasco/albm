import { errorJson, json, requireOwner } from '@/lib/api';
import { logAdmin } from '@/lib/audit-log';
import { getVersionInfo } from '@/lib/version';
import { startUpdate, updaterConfigured, updaterStatus } from '@/lib/updater';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireOwner();
  if (denied) return denied;
  if (!updaterConfigured()) return errorJson('Updater not configured', 501);
  return json(await updaterStatus());
}

/** Updates to the latest published release. The version comes from the server, never the client. */
export async function POST() {
  const denied = await requireOwner();
  if (denied) return denied;
  if (!updaterConfigured()) return errorJson('Updater not configured', 501);
  const info = await getVersionInfo();
  if (!info.updateAvailable || !info.latest) return errorJson('Already up to date', 409);
  const err = await startUpdate(info.latest);
  if (err) return errorJson(err, 502);
  logAdmin('system.update', { targetType: 'system', targetId: info.latest, summary: `Started update ${info.current} -> ${info.latest}` });
  return json({ ok: true, target: info.latest });
}
