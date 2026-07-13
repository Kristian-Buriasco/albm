import fs from 'node:fs';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { detectImageType } from '@/lib/files';
import { watermarkPath } from '@/lib/paths';
import { getSetting, setSetting } from '@/lib/settings';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return json({
    aboutContent: getSetting('aboutContent') ?? '',
    contactContent: getSetting('contactContent') ?? '',
    hasWatermark: fs.existsSync(watermarkPath()),
  });
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const contentType = req.headers.get('content-type') ?? '';

  // Watermark image upload (multipart)
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('watermark');
    if (!(file instanceof File)) return errorJson('Missing watermark file', 400);
    if (file.size > 10 * 1024 * 1024) return errorJson('Watermark too large', 413);
    const buf = Buffer.from(await file.arrayBuffer());
    if (detectImageType(buf) !== 'png') {
      return errorJson('Watermark must be a PNG', 415);
    }
    fs.writeFileSync(watermarkPath(), buf);
    return json({ ok: true });
  }

  // Text settings (JSON)
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }
  if (typeof body.aboutContent === 'string') {
    setSetting('aboutContent', body.aboutContent);
  }
  if (typeof body.contactContent === 'string') {
    setSetting('contactContent', body.contactContent);
  }
  return json({ ok: true });
}

export async function DELETE() {
  const denied = await requireAdmin();
  if (denied) return denied;
  fs.rmSync(watermarkPath(), { force: true });
  return json({ ok: true });
}
