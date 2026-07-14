import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const status = new URL(req.url).searchParams.get('status') ?? 'all';

  const db = getDb();
  const rows = db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.galleryId, id))
    .all()
    .filter((c) => {
      if (status === 'all') return c.status !== 'hidden';
      return c.status === status;
    });

  return json({ comments: rows });
}

export async function POST(req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  const photoId = typeof body.photoId === 'string' ? body.photoId : null;
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!photoId || !text) return errorJson('photoId and body required', 400);
  if (text.length > 2000) return errorJson('Comment too long', 400);

  const db = getDb();
  const photo = db
    .select()
    .from(schema.photos)
    .where(and(eq(schema.photos.id, photoId), eq(schema.photos.galleryId, id)))
    .get();
  if (!photo) return errorJson('Photo not found', 404);

  const { nanoid } = await import('nanoid');
  const { photographerAuthorName } = await import('@/lib/comments');
  const comment = {
    id: nanoid(),
    galleryId: id,
    photoId,
    visitorId: null,
    commenterToken: null,
    authorName: photographerAuthorName(),
    body: text,
    isPhotographer: true,
    status: 'visible' as const,
  };
  db.insert(schema.comments).values(comment).run();
  return json(comment, 201);
}
