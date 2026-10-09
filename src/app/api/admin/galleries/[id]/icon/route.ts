import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireOwner } from '@/lib/api';
import { logAdmin } from '@/lib/audit-log';
import { galleryIconVersion } from '@/lib/gallery-icon';
import { IconError, normalizeIcon } from '@/lib/icon-image';
import { galleryIconPath } from '@/lib/paths';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function findGallery(id: string) {
  return getDb().select().from(schema.galleries).where(eq(schema.galleries.id, id)).get();
}

/** Does this gallery have its own icon, and which version. */
export async function GET(_req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  if (!findGallery(id)) return errorJson('Not found', 404);
  const version = galleryIconVersion(id);
  return json({ exists: version !== null, version });
}

/** Upload (or replace) the icon. Any PNG/JPEG/WebP/SVG is normalised to a 512px PNG. */
export async function POST(req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  const gallery = findGallery(id);
  if (!gallery) return errorJson('Not found', 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorJson('Expected multipart form data', 400);
  }
  const file = form.get('file');
  if (!(file instanceof File)) return errorJson('Missing file', 400);
  if (file.size > 5 * 1024 * 1024) return errorJson('Image too large (max 5 MB)', 413);

  let png: Buffer;
  try {
    png = await normalizeIcon(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof IconError) return errorJson(err.message, err.status);
    throw err;
  }

  const dest = galleryIconPath(id);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, png);
  logAdmin('gallery.icon.set', { targetType: 'gallery', targetId: id, summary: `Set browser-tab icon for "${gallery.title}"` });
  return json({ ok: true, version: galleryIconVersion(id) });
}

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  const gallery = findGallery(id);
  if (!gallery) return errorJson('Not found', 404);
  fs.rmSync(galleryIconPath(id), { force: true });
  logAdmin('gallery.icon.remove', { targetType: 'gallery', targetId: id, summary: `Removed browser-tab icon for "${gallery.title}"` });
  return json({ ok: true });
}
