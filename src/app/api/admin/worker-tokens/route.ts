import { errorJson, json, requireAdmin } from '@/lib/api';
import { logAdmin } from '@/lib/audit-log';
import { createWorkerToken, listWorkerTokens, revokeWorkerToken } from '@/lib/worker-tokens';

export const dynamic = 'force-dynamic';

function publicRow(r: ReturnType<typeof listWorkerTokens>[number]) {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
    revokedAt: r.revokedAt,
  };
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return json({ tokens: listWorkerTokens().map(publicRow) });
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

  const { row, rawToken } = createWorkerToken(name);
  logAdmin('worker_token.create', {
    targetType: 'worker_token',
    targetId: row.id,
    summary: `Created worker token "${name}"`,
  });
  return json({ token: rawToken, row: publicRow(row) }, 201);
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  // The panel sends {id} in the body (like upload tokens); `?id=` is accepted too.
  let id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id) {
    try {
      const body = await req.json();
      if (body && typeof body === 'object' && typeof body.id === 'string') id = body.id;
    } catch {
      /* no body */
    }
  }
  if (!id) return errorJson('id required', 400);

  const ok = revokeWorkerToken(id);
  if (!ok) return errorJson('Not found', 404);

  logAdmin('worker_token.revoke', {
    targetType: 'worker_token',
    targetId: id,
    summary: 'Revoked worker token',
  });
  return json({ ok: true });
}
