import { errorJson, json, requireOwner } from '@/lib/api';
import {
  addGalleryNote,
  isDeliveryState,
  setDeliveryState,
} from '@/lib/lifecycle';

type Params = { params: Promise<{ id: string }> };

const OWNER = { type: 'owner', id: null } as const;

/** Advance the delivery state (owner-only). Logs a gallery_events transition. */
export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  if (!isDeliveryState(body.state)) {
    return errorJson('Invalid delivery state', 400);
  }
  const changed = setDeliveryState(id, body.state, OWNER);
  return json({ ok: true, changed });
}

/** Append a free-text note to the delivery timeline (owner-only). */
export async function POST(req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  const note = typeof body.note === 'string' ? body.note : '';
  if (!note.trim()) return errorJson('Note required', 400);
  addGalleryNote(id, note, OWNER);
  return json({ ok: true });
}
