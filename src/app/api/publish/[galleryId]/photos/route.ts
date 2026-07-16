import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json } from '@/lib/api';
import { ingestGalleryPhoto } from '@/lib/photo-upload';
import { ipFromRequest, writeAllowed } from '@/lib/rate-limit';
import { verifyUploadToken } from '@/lib/upload-tokens';

export const dynamic = 'force-dynamic';

const PUBLISH_RL_MAX = 300;
const PUBLISH_RL_WINDOW = 15 * 60 * 1000;

type Params = { params: Promise<{ galleryId: string }> };

export async function POST(req: Request, { params }: Params) {
  const { galleryId } = await params;
  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!bearer) return errorJson('Unauthorized', 401);

  const tokenRow = verifyUploadToken(bearer);
  if (!tokenRow) return errorJson('Unauthorized', 401);

  const ip = ipFromRequest(req);
  if (!writeAllowed(`publish:${tokenRow.id}`, ip, PUBLISH_RL_MAX, PUBLISH_RL_WINDOW)) {
    return errorJson('Too many requests', 429);
  }

  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, galleryId))
    .get();
  if (!gallery) return errorJson('Not found', 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorJson('Expected multipart form data', 400);
  }
  const file = form.get('file');
  if (!(file instanceof File)) return errorJson('Missing file', 400);

  const sectionIdRaw = form.get('sectionId');
  const sectionId = typeof sectionIdRaw === 'string' ? sectionIdRaw : null;

  const result = await ingestGalleryPhoto(galleryId, file, sectionId, {
    fromPublishApi: true,
  });
  if (!result.ok) return errorJson(result.error, result.status);
  if ('duplicate' in result && result.duplicate) {
    return json({ duplicate: true, existingFilename: result.existingFilename });
  }
  if (result.ok && result.created) {
    return json(result.photo, 201);
  }
  return errorJson('Upload failed', 500);
}
