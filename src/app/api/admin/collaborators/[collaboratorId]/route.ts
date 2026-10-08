import { errorJson, json, requireOwner } from '@/lib/api';
import { getCollaborator, setCollaboratorName } from '@/lib/collaborators';
import { logAdmin } from '@/lib/audit-log';

type Params = { params: Promise<{ collaboratorId: string }> };

export const dynamic = 'force-dynamic';

const NAME_MAX = 200;

/** Set the display name used for photographer credits (owner only). Empty clears it. */
export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { collaboratorId } = await params;

  const collab = getCollaborator(collaboratorId);
  if (!collab) return errorJson('Not found', 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  if (typeof body.name !== 'string') return errorJson('name (string) required', 400);

  const name = body.name.trim().slice(0, NAME_MAX) || null;
  setCollaboratorName(collaboratorId, name);

  logAdmin('collaborator.rename', {
    targetType: 'collaborator',
    targetId: collaboratorId,
    summary: `Set credit name for ${collab.email}`,
  });

  return json({ ok: true, name });
}
