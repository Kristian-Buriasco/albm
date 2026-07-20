import { errorJson, json, requireAdmin } from '@/lib/api';
import { regenerateGalleryDerivatives, regeneratePhotoDerivatives } from '@/lib/integrity';

export const dynamic = 'force-dynamic';

/** Owner-only: regenerate missing derivatives for one photo or every photo in a gallery. */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { photoId?: unknown; galleryId?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  if (typeof body.photoId === 'string' && body.photoId) {
    const result = await regeneratePhotoDerivatives(body.photoId);
    return json(result);
  }

  if (typeof body.galleryId === 'string' && body.galleryId) {
    const result = await regenerateGalleryDerivatives(body.galleryId);
    return json(result);
  }

  return errorJson('photoId or galleryId required', 400);
}
