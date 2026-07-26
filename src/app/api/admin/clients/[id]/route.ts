import { errorJson, json, requireOwner } from '@/lib/api';
import { deleteClient, galleriesForClient, getClient, updateClient } from '@/lib/clients';
import { logAdmin } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;

  const client = getClient(id);
  if (!client) return errorJson('Not found', 404);
  return json({ client, galleries: galleriesForClient(id) });
}

export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;

  const existing = getClient(id);
  if (!existing) return errorJson('Not found', 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  const updated = updateClient(id, {
    name: typeof body.name === 'string' ? body.name : undefined,
    email: typeof body.email === 'string' ? body.email : undefined,
    phone: 'phone' in body ? (typeof body.phone === 'string' ? body.phone : null) : undefined,
    notes: 'notes' in body ? (typeof body.notes === 'string' ? body.notes : null) : undefined,
  });
  if (!updated) return errorJson('Invalid request', 400);

  logAdmin('client.update', {
    targetType: 'client',
    targetId: id,
    summary: `Updated client "${updated.name}"`,
  });
  return json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;

  const existing = getClient(id);
  if (!existing) return errorJson('Not found', 404);

  deleteClient(id);
  logAdmin('client.delete', {
    targetType: 'client',
    targetId: id,
    summary: `Deleted client "${existing.name}"`,
  });
  return json({ ok: true });
}
