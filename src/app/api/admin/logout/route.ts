import { revokeCurrentAdminSession } from '@/lib/session';
import { json } from '@/lib/api';

export async function POST() {
  await revokeCurrentAdminSession();
  return json({ ok: true });
}
