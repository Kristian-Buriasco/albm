import { errorJson, json, readJsonObject, requireAdmin } from '@/lib/api';
import { logAdmin } from '@/lib/audit-log';
import { clearStorage, saveStorage, storageView, testConnection, validateForm, type StorageForm } from '@/lib/storage-settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return json(storageView());
}

export async function PUT(req: Request) {
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
  try {
    // Never save credentials that do not work: a bad key would silently break every image.
    if (form.enabled) {
      const test = await testConnection(form);
      if (!test.ok) return errorJson(`Not saved. ${test.error}`, 400);
    }
    saveStorage(form);
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : 'Could not save', 400);
  }
  logAdmin('storage.update', {
    targetType: 'settings',
    summary: `Object storage ${form.enabled ? `on (bucket ${form.bucket})` : 'off'}`,
  });
  return json(storageView());
}

/** Forget the saved settings so the S3_* environment variables apply again. */
export async function DELETE() {
  const denied = await requireAdmin();
  if (denied) return denied;
  clearStorage();
  logAdmin('storage.reset', { targetType: 'settings', summary: 'Object storage settings reset to environment' });
  return json(storageView());
}
