import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json } from '@/lib/api';
import { canViewGallery } from '@/lib/gallery-auth';
import { ipFromRequest, writeAllowed } from '@/lib/rate-limit';
import { getVisitorSession } from '@/lib/session';
import { hasSubmittedTestimonial, submitTestimonial } from '@/lib/testimonials';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

const TESTIMONIAL_WRITE_MAX = 5;
const TESTIMONIAL_WRITE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: Request, { params }: Params) {
  if (
    !writeAllowed(
      'testimonial',
      ipFromRequest(req),
      TESTIMONIAL_WRITE_MAX,
      TESTIMONIAL_WRITE_WINDOW_MS,
    )
  ) {
    return errorJson('Too many requests', 429);
  }

  const { slug } = await params;
  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.slug, slug))
    .get();
  if (!gallery || gallery.type !== 'client' || !(await canViewGallery(gallery))) {
    return errorJson('Not found', 404);
  }
  if (gallery.deliveryState !== 'delivered') {
    return errorJson('Not found', 404);
  }

  const session = await getVisitorSession(gallery.id);
  if (!session.token) return errorJson('No visitor session', 401);
  const visitor = db
    .select()
    .from(schema.visitors)
    .where(eq(schema.visitors.sessionToken, session.token))
    .get();
  if (!visitor || visitor.galleryId !== gallery.id) {
    return errorJson('No visitor session', 401);
  }

  if (hasSubmittedTestimonial(gallery.id, visitor.id)) {
    return errorJson('You have already submitted a testimonial', 409);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  const rating = typeof body.rating === 'number' ? body.rating : NaN;
  const quote = typeof body.quote === 'string' ? body.quote : '';
  const authorName =
    typeof body.authorName === 'string' && body.authorName.trim()
      ? body.authorName.trim()
      : (visitor.name ?? '');

  if (!authorName) return errorJson('Name is required', 400);

  const result = submitTestimonial({
    galleryId: gallery.id,
    visitorId: visitor.id,
    rating,
    quote,
    authorName,
  });
  if (!result.ok) return errorJson(result.error, 400);

  return json({ ok: true }, 201);
}
