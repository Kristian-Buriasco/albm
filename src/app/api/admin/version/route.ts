import { json, requireAdmin } from '@/lib/api';
import { getVersionInfo } from '@/lib/version';
import { updaterConfigured } from '@/lib/updater';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return json({ ...(await getVersionInfo()), canUpdate: updaterConfigured() });
}
