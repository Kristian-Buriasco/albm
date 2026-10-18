import { errorJson, json, readJsonObject, requireAdmin } from '@/lib/api';
import { testConnection, validateForm, type StorageForm } from '@/lib/storage-settings';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req);
  } catch {
    return errorJson('Invalid request', 400);
  }
  const form = validateForm(body as unknown as StorageForm);
  if (typeof form === 'string') return errorJson(form, 400);
  return json(await testConnection(form));
}
