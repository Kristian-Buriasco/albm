import { errorJson, json, requireOwner } from '@/lib/api';
import { assignTagToClient, unassignTagFromClient } from '@/lib/clients';
import { createTag, tagExists } from '@/lib/tags';
import { getClient } from '@/lib/clients';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  if (!getClient(id)) return errorJson('Not found', 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  let tagId: string;
  if (typeof body.tagId === 'string') {
    if (!tagExists(body.tagId)) return errorJson('Unknown tag', 400);
    tagId = body.tagId;
  } else if (typeof body.tagName === 'string' && body.tagName.trim()) {
    tagId = createTag(body.tagName).id;
  } else {
    return errorJson('tagId or tagName required', 400);
  }

  assignTagToClient(id, tagId);
  return json({ ok: true, tagId });
}

export async function DELETE(req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  if (!getClient(id)) return errorJson('Not found', 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  if (typeof body.tagId !== 'string') return errorJson('tagId required', 400);

  unassignTagFromClient(id, body.tagId);
  return json({ ok: true });
}
