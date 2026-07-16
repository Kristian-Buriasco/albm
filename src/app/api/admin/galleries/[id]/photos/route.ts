import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { ingestGalleryPhoto } from '@/lib/photo-upload';
import { getPhotoTagsForGallery } from '@/lib/tags';

type Params = { params: Promise<{ id: string }> };

/** Lightweight photo list, used by the admin UI for status polling. */
export async function GET(req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const withTags = new URL(req.url).searchParams.get('tags') === '1';

  const rows = getDb()
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.galleryId, id))
    .orderBy(asc(schema.photos.sortOrder))
    .all();

  if (withTags) {
    return json({ photos: rows, photoTags: getPhotoTagsForGallery(id) });
  }
  return json(rows);
}

export async function POST(req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

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

  const result = await ingestGalleryPhoto(id, file, sectionId);
  if (!result.ok) return errorJson(result.error, result.status);
  if ('duplicate' in result && result.duplicate) {
    return json({ duplicate: true, existingFilename: result.existingFilename });
  }
  if (result.ok && result.created) {
    return json(result.photo, 201);
  }
  return errorJson('Upload failed', 500);
}
