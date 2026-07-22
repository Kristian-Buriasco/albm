import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json } from '@/lib/api';
import { ipFromRequest, writeAllowed } from '@/lib/rate-limit';
import { verifyUploadToken } from '@/lib/upload-tokens';
import { deletePhotoById } from '@/lib/delete-photo';
import { ingestGalleryPhoto } from '@/lib/photo-upload';
import { logAdmin } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

const RL_MAX = 300;
const RL_WINDOW = 15 * 60 * 1000;

type Params = { params: Promise<{ galleryId: string; photoId: string }> };

/** Verify bearer token + rate limit. Returns the token row or an error Response. */
async function authorize(req: Request, scope: string) {
  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!bearer) return { error: errorJson('Unauthorized', 401) };
  const tokenRow = verifyUploadToken(bearer);
  if (!tokenRow) return { error: errorJson('Unauthorized', 401) };
  const ip = ipFromRequest(req);
  if (!writeAllowed(`${scope}:${tokenRow.id}`, ip, RL_MAX, RL_WINDOW)) {
    return { error: errorJson('Too many requests', 429) };
  }
  return { tokenRow };
}

/** Look up a photo scoped to its gallery; null if it does not belong there. */
function photoInGallery(galleryId: string, photoId: string) {
  return getDb()
    .select()
    .from(schema.photos)
    .where(and(eq(schema.photos.id, photoId), eq(schema.photos.galleryId, galleryId)))
    .get();
}

/** Replace an existing photo's content in place (edited re-publish). */
export async function PUT(req: Request, { params }: Params) {
  const { galleryId, photoId } = await params;
  const authed = await authorize(req, 'publish-replace');
  if ('error' in authed) return authed.error;

  const existing = photoInGallery(galleryId, photoId);
  if (!existing) return errorJson('Not found', 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorJson('Expected multipart form data', 400);
  }
  const file = form.get('file');
  if (!(file instanceof File)) return errorJson('Missing file', 400);
  const sectionId = existing.sectionId;

  // Delete the old row + its files, then ingest the new content. The filename
  // is now free, so no collision-rename happens.
  deletePhotoById(photoId);
  const result = await ingestGalleryPhoto(galleryId, file, sectionId, {
    fromPublishApi: true,
  });
  if (!result.ok) return errorJson(result.error, result.status);
  if ('duplicate' in result && result.duplicate) {
    return json({ duplicate: true, existingFilename: result.existingFilename });
  }
  if (result.ok && result.created) {
    logAdmin('publish.replace', {
      targetType: 'photo',
      targetId: result.photo.id,
      summary: `Replaced photo via publish token "${authed.tokenRow.name}"`,
    });
    return json(result.photo, 200);
  }
  return errorJson('Replace failed', 500);
}

/** Delete a photo (removed from the Lightroom publish collection). */
export async function DELETE(req: Request, { params }: Params) {
  const { galleryId, photoId } = await params;
  const authed = await authorize(req, 'publish-delete');
  if ('error' in authed) return authed.error;

  const existing = photoInGallery(galleryId, photoId);
  if (!existing) return errorJson('Not found', 404);

  deletePhotoById(photoId);
  logAdmin('publish.delete', {
    targetType: 'photo',
    targetId: photoId,
    summary: `Deleted photo "${existing.filename}" via publish token "${authed.tokenRow.name}"`,
  });
  return json({ ok: true });
}
