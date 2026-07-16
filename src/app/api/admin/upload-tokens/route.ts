import { errorJson, json, requireAdmin } from '@/lib/api';
import { logAdmin } from '@/lib/audit-log';
import { createUploadToken, listUploadTokens, revokeUploadToken } from '@/lib/upload-tokens';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const rows = listUploadTokens().map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
    revokedAt: r.revokedAt,
  }));
  return json({ tokens: rows });
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
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return errorJson('Name required', 400);

  const { row, rawToken } = createUploadToken(name);
  logAdmin('upload_token.create', {
    targetType: 'upload_token',
    targetId: row.id,
    summary: `Created upload token "${name}"`,
  });
  return json(
    {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
      token: rawToken,
    },
    201,
  );
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return errorJson('id required', 400);

  const ok = revokeUploadToken(id);
  if (!ok) return errorJson('Not found', 404);

  logAdmin('upload_token.revoke', {
    targetType: 'upload_token',
    targetId: id,
    summary: 'Revoked upload token',
  });
  return json({ ok: true });
}
