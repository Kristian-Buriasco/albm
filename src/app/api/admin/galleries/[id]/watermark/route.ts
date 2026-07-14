import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { detectImageType } from '@/lib/files';
import { galleryWatermarkPath } from '@/lib/paths';
import { reprocessPhoto } from '@/lib/queue';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const p = galleryWatermarkPath(id);
  if (!fs.existsSync(p)) return new Response(null, { status: 404 });
  const buf = fs.readFileSync(p);
  return new Response(buf, { headers: { 'Content-Type': 'image/png' } });
}

export async function POST(req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const gallery = getDb()
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, id))
    .get();
  if (!gallery) return errorJson('Not found', 404);

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return errorJson('Missing file', 400);
  const buf = Buffer.from(await file.arrayBuffer());
  if (!detectImageType(buf)) return errorJson('PNG required', 415);

  const dest = galleryWatermarkPath(id);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);

  if (gallery.watermarkEnabled) {
    const photos = getDb()
      .select({ id: schema.photos.id })
      .from(schema.photos)
      .where(eq(schema.photos.galleryId, id))
      .all();
    for (const p of photos) reprocessPhoto(p.id);
  }

  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  fs.rmSync(galleryWatermarkPath(id), { force: true });

  const gallery = getDb()
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, id))
    .get();
  if (gallery?.watermarkEnabled) {
    const photos = getDb()
      .select({ id: schema.photos.id })
      .from(schema.photos)
      .where(eq(schema.photos.galleryId, id))
      .all();
    for (const p of photos) reprocessPhoto(p.id);
  }
  return json({ ok: true });
}
