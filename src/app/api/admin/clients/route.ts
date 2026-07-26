import { errorJson, json, requireOwner } from '@/lib/api';
import { createClient, listClients } from '@/lib/clients';
import { logAdmin } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireOwner();
  if (denied) return denied;
  return json(listClients());
}

export async function POST(req: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  const name = typeof body.name === 'string' ? body.name : '';
  const email = typeof body.email === 'string' ? body.email : '';
  if (!name.trim() || !email.trim()) return errorJson('Name and email are required', 400);

  const client = createClient({
    name,
    email,
    phone: typeof body.phone === 'string' ? body.phone : null,
    notes: typeof body.notes === 'string' ? body.notes : null,
  });
  if (!client) return errorJson('Name and email are required', 400);

  logAdmin('client.create', {
    targetType: 'client',
    targetId: client.id,
    summary: `Created client "${client.name}"`,
  });
  return json(client, 201);
}
