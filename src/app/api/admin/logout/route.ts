import { getAdminSession } from '@/lib/session';
import { json } from '@/lib/api';

export async function POST() {
  const session = await getAdminSession();
  session.destroy();
  return json({ ok: true });
}
