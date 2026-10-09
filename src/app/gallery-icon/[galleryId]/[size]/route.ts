import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { isIconSize, resizeIcon } from '@/lib/icon-image';
import { galleryIconPath } from '@/lib/paths';
import { isAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ galleryId: string; size: string }> };

const notFound = () => new Response('Not found', { status: 404 });

/**
 * A gallery's browser-tab icon at one of the supported sizes. Public for PUBLISHED galleries —
 * including password-protected ones, because the browser requests the icon before anyone has
 * unlocked the page, and an icon is branding, not content. Unpublished galleries serve it to
 * the owner only (404 for everyone else, so a draft's existence isn't revealed).
 */
export async function GET(req: Request, { params }: Params) {
  const { galleryId, size: sizeRaw } = await params;
  const size = Number(sizeRaw);
  if (!Number.isInteger(size) || !isIconSize(size)) return notFound();

  const gallery = getDb()
    .select({ id: schema.galleries.id, published: schema.galleries.published })
    .from(schema.galleries)
    .where(eq(schema.galleries.id, galleryId))
    .get();
  if (!gallery) return notFound();
  if (!gallery.published && !(await isAdmin())) return notFound();

  let master: Buffer;
  try {
    master = fs.readFileSync(galleryIconPath(galleryId));
  } catch {
    return notFound();
  }
  const body = await resizeIcon(master, size);
  // The URL carries ?v=<mtime>, so a versioned request can be cached forever.
  const versioned = new URL(req.url).searchParams.has('v');
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(body.length),
      'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
