import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json } from '@/lib/api';
import { canViewGallery } from '@/lib/gallery-auth';
import {
  detectFacesFromBuffer,
  loadGalleryFaceEmbeddings,
  matchPhotoIds,
  SELFIE_MAX_BYTES,
} from '@/lib/face-search';
import { ipFromRequest, writeAllowed } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/** Hard rate-limit: 3 selfie searches / 15 min per IP. */
const SELFIE_MAX = 3;
const SELFIE_WINDOW_MS = 15 * 60 * 1000;

/**
 * POST multipart field `selfie` — processed in memory only, never stored.
 * [decision] privacy: discard buffer after embedding; return match photo IDs only.
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const ip = ipFromRequest(req);
  if (!writeAllowed(`face-selfie:${slug}`, ip, SELFIE_MAX, SELFIE_WINDOW_MS)) {
    return errorJson('Too many selfie searches. Try again later.', 429);
  }

  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(and(eq(schema.galleries.slug, slug), eq(schema.galleries.type, 'client')))
    .get();
  if (!gallery || !(await canViewGallery(gallery))) {
    return errorJson('Not found', 404);
  }
  if (!gallery.faceSearch) {
    return errorJson('Face search is not enabled', 404);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorJson('Invalid form data', 400);
  }
  const file = form.get('selfie');
  if (!(file instanceof File)) {
    return errorJson('Missing selfie file', 400);
  }
  if (file.size <= 0 || file.size > SELFIE_MAX_BYTES) {
    return errorJson('Selfie must be under 5 MB', 400);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  // Intentionally no fs.write — selfie stays in-memory only.
  let faces;
  try {
    faces = await detectFacesFromBuffer(buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not process selfie';
    return errorJson(msg, 400);
  } finally {
    // Drop reference promptly (GC); never persist.
    void buf;
  }

  if (faces.length === 0) {
    return json({ photoIds: [], count: 0, facesDetected: 0 });
  }

  const stored = loadGalleryFaceEmbeddings(gallery.id);
  const matched = new Set<string>();
  for (const face of faces) {
    for (const id of matchPhotoIds(face.embedding, stored)) {
      matched.add(id);
    }
  }

  return json({
    photoIds: [...matched],
    count: matched.size,
    facesDetected: faces.length,
    // Selfie was not stored
    selfieStored: false,
  });
}
