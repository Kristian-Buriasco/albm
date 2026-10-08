import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { hasGalleryAccess } from '@/lib/session';
import { canAdminViewGallery } from '@/lib/api';
import { galleryRequiresAccess } from '@/lib/pin';
import { thumbPath, mdPath, webPath } from '@/lib/paths';
import { streamFileResponse } from '@/lib/stream';
import { isGalleryExpired } from '@/lib/downloads';
import { derivativeSource, renderWebpVariant, watermarkOptsFor } from '@/lib/queue';

type Params = { params: Promise<{ photoId: string; variant: string }> };

const VARIANTS = { thumb: thumbPath, md: mdPath, web: webPath } as const;
type Variant = keyof typeof VARIANTS;

export async function GET(req: Request, { params }: Params) {
  const { photoId, variant } = await params;
  if (!(variant in VARIANTS)) {
    return new Response('Not found', { status: 404 });
  }
  const v = variant as Variant;

  const db = getDb();
  const photo = db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.id, photoId))
    .get();
  if (!photo) return new Response('Not found', { status: 404 });

  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, photo.galleryId))
    .get();
  if (!gallery) return new Response('Not found', { status: 404 });

  if (!(await canAdminViewGallery(gallery.id))) {
    // Unpublished must be indistinguishable from nonexistent (no existence
    // oracle); 403 is reserved for published-but-locked galleries.
    if (!gallery.published) return new Response('Not found', { status: 404 });
    if (isGalleryExpired(gallery)) return new Response('Not found', { status: 404 });
    if (
      gallery.type === 'client' &&
      galleryRequiresAccess(gallery) &&
      !(await hasGalleryAccess(gallery.id))
    ) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  let filePath = VARIANTS[v](photo.galleryId, photo.filename);

  // Lazy-generate the `md` (1280) variant for photos processed before it
  // existed. Built from the original with the gallery's watermark opts so it
  // matches a freshly-queued md; on failure fall back to `web`.
  if (v === 'md' && !fs.existsSync(filePath)) {
    try {
      await renderWebpVariant(
        derivativeSource(photo),
        1280,
        82,
        filePath,
        photo.galleryId,
        watermarkOptsFor(gallery),
      );
    } catch (err) {
      console.error(`[img] md lazy-gen failed for ${photoId}:`, err);
      filePath = webPath(photo.galleryId, photo.filename);
    }
  }

  // A `?v=` version stamp (updatedAt) makes the bytes content-addressed, so the
  // response is safely immutable; without it, keep conservative revalidation.
  const versioned = new URL(req.url).searchParams.has('v');
  const scope = gallery.type === 'portfolio' ? 'public' : 'private';
  const cacheControl = versioned
    ? `${scope}, max-age=31536000, immutable`
    : gallery.type === 'portfolio'
      ? 'public, max-age=86400'
      : 'private, max-age=3600';

  return streamFileResponse(req, filePath, {
    contentType: 'image/webp',
    cacheControl,
  });
}
