import { requireAdmin, errorJson, json } from '@/lib/api';
import { canDeletePasskey } from '@/lib/admin-auth-settings';
import {
  deletePasskey,
  getPasskeyById,
  renamePasskey,
} from '@/lib/passkey-store';
import { logAdmin } from '@/lib/audit-log';

const LABEL_MAX = 100;

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const passkey = getPasskeyById(id);
  if (!passkey) return errorJson('Not found', 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  const label =
    typeof body === 'object' && body !== null && 'label' in body
      ? (body as { label: unknown }).label
      : null;

  if (typeof label !== 'string' || label.trim().length === 0) {
    return errorJson('Label is required', 400);
  }

  renamePasskey(id, label.trim().slice(0, LABEL_MAX));
  return json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const passkey = getPasskeyById(id);
  if (!passkey) return errorJson('Not found', 404);

  const guard = canDeletePasskey();
  if (!guard.ok) {
    return errorJson(guard.reason ?? 'Cannot delete passkey', 400);
  }

  deletePasskey(id);
  logAdmin('passkey.remove', {
    targetType: 'passkey',
    targetId: id,
    summary: `Removed passkey "${passkey.label}"`,
  });
  return json({ ok: true });
}
