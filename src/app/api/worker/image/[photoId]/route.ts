import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson } from '@/lib/api';
import { fetchDerivative, objectStoreEnabled } from '@/lib/object-store';
import { mdPath, webPath } from '@/lib/paths';
import { streamFileResponse } from '@/lib/stream';
import { authorizeWorker } from '@/lib/worker-analysis';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ photoId: string }> };

/** Derivative bytes for an authorized worker. No gallery access checks: a worker token is trusted. */
export async function GET(req: Request, { params }: Params) {
  if (!authorizeWorker(req)) return errorJson('Unauthorized', 401);
  const { photoId } = await params;
  const variant = new URL(req.url).searchParams.get('variant') ?? 'web';
  if (variant !== 'web' && variant !== 'md') return errorJson('variant must be web or md', 400);

  const photo = getDb()
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, photoId))
    .get();
  if (!photo) return errorJson('Not found', 404);

  const cacheControl = 'private, max-age=3600';
  const filePath = (variant === 'md' ? mdPath : webPath)(photo.galleryId, photo.filename);
  if (!fs.existsSync(filePath) && objectStoreEnabled()) {
    try {
      const res = await fetchDerivative(photo.galleryId, variant, photo.filename);
      if (!res) return errorJson('Not found', 404);
      const length = res.headers.get('content-length');
      return new Response(res.body, {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': cacheControl,
          ...(length ? { 'Content-Length': length } : {}),
        },
      });
    } catch (err) {
      console.error(`[worker/image] bucket fetch failed for ${photoId}:`, err);
      return errorJson('Bad gateway', 502);
    }
  }
  return streamFileResponse(req, filePath, { contentType: 'image/webp', cacheControl });
}
