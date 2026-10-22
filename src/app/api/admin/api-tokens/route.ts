import { errorJson, json, requireAdmin } from '@/lib/api';
import { logAdmin } from '@/lib/audit-log';
import { createApiToken, listApiTokens, revokeApiToken, type ApiScope } from '@/lib/api-tokens';

export const dynamic = 'force-dynamic';

function publicRow(r: ReturnType<typeof listApiTokens>[number]) {
  return { id: r.id, name: r.name, scope: r.scope, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt, revokedAt: r.revokedAt };
}

// Session-only: this route is not in TOKEN_ROUTES, so a token can never mint or revoke tokens.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return json({ tokens: listApiTokens().map(publicRow) });
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
  const scope = body.scope as ApiScope;
  if (scope !== 'read' && scope !== 'write') return errorJson('Scope must be read or write', 400);
  const { row, rawToken } = createApiToken(name, scope);
  logAdmin('api_token.create', { targetType: 'api_token', targetId: row.id, summary: `Created ${scope} API token "${name}"` });
  return json({ token: rawToken, row: publicRow(row) }, 201);
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
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
  if (!revokeApiToken(id)) return errorJson('Not found', 404);
  logAdmin('api_token.revoke', { targetType: 'api_token', targetId: id, summary: 'Revoked API token' });
  return json({ ok: true });
}
