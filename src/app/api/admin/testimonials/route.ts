import { json, requireAdmin } from '@/lib/api';
import { listTestimonials, type TestimonialStatus } from '@/lib/testimonials';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: TestimonialStatus[] = ['pending', 'approved', 'hidden'];

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const statusParam = new URL(req.url).searchParams.get('status');
  const status = VALID_STATUSES.includes(statusParam as TestimonialStatus)
    ? (statusParam as TestimonialStatus)
    : undefined;

  return json({ testimonials: listTestimonials(status ? { status } : undefined) });
}
