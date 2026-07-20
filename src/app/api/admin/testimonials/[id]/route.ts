import { errorJson, json, requireAdmin } from '@/lib/api';
import { approveTestimonial, hideTestimonial } from '@/lib/testimonials';

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
  if (body.status !== 'approved' && body.status !== 'hidden') {
    return errorJson('Invalid status', 400);
  }

  const updated =
    body.status === 'approved' ? approveTestimonial(id) : hideTestimonial(id);
  if (!updated) return errorJson('Not found', 404);

  return json({ ok: true, testimonial: updated });
}
