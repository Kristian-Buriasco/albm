import { errorJson, json, requireAdmin } from '@/lib/api';
import { setInquiryStatus } from '@/lib/inquiries';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  const status = body.status;
  if (status !== 'new' && status !== 'read' && status !== 'archived') {
    return errorJson('Invalid status', 400);
  }

  setInquiryStatus(id, status);
  return json({ ok: true });
}
