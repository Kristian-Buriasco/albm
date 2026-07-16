import { errorJson, json, requireAdmin } from '@/lib/api';
import { detectImageType } from '@/lib/files';
import { getGalleryDefaults, parseGalleryDefaults, saveGalleryDefaults } from '@/lib/gallery-defaults';
import { watermarkPath } from '@/lib/paths';
import { getSetting, setSetting } from '@/lib/settings';
import { logAdmin } from '@/lib/audit-log';
import fs from 'node:fs';

export const dynamic = 'force-dynamic';

const SHORT_MAX = 200;
const INTRO_MAX = 2000;

function setCapped(key: string, value: string, max: number): void {
  setSetting(key, value.slice(0, max));
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return json({
    aboutContent: getSetting('aboutContent') ?? '',
    contactContent: getSetting('contactContent') ?? '',
    analyticsHeadHtml: getSetting('analytics_head_html') ?? '',
    homeEyebrow: getSetting('homeEyebrow') ?? '',
    homeHeadline: getSetting('homeHeadline') ?? '',
    homeIntro: getSetting('homeIntro') ?? '',
    contactEmail: getSetting('contactEmail') ?? '',
    contactInstagram: getSetting('contactInstagram') ?? '',
    contactWhatsapp: getSetting('contactWhatsapp') ?? '',
    footerContent: getSetting('footerContent') ?? '',
    defaultLanguage: getSetting('defaultLanguage') ?? 'en',
    galleryDefaults: getGalleryDefaults(),
    hasWatermark: fs.existsSync(watermarkPath()),
  });
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const contentType = req.headers.get('content-type') ?? '';

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
    logAdmin('settings.watermark.upload', {
      targetType: 'settings',
      summary: 'Uploaded site watermark PNG',
    });
    return json({ ok: true });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  if (typeof body.aboutContent === 'string') {
    setCapped('aboutContent', body.aboutContent, INTRO_MAX);
  }
  if (typeof body.contactContent === 'string') {
    setCapped('contactContent', body.contactContent, INTRO_MAX);
  }
  if (typeof body.analyticsHeadHtml === 'string') {
    setCapped('analytics_head_html', body.analyticsHeadHtml, INTRO_MAX);
  }
  if (typeof body.homeEyebrow === 'string') {
    setCapped('homeEyebrow', body.homeEyebrow, SHORT_MAX);
  }
  if (typeof body.homeHeadline === 'string') {
    setCapped('homeHeadline', body.homeHeadline, SHORT_MAX);
  }
  if (typeof body.homeIntro === 'string') {
    setCapped('homeIntro', body.homeIntro, INTRO_MAX);
  }
  if (typeof body.contactEmail === 'string') {
    setCapped('contactEmail', body.contactEmail.trim(), SHORT_MAX);
  }
  if (typeof body.contactInstagram === 'string') {
    setCapped('contactInstagram', body.contactInstagram.trim(), SHORT_MAX);
  }
  if (typeof body.contactWhatsapp === 'string') {
    setCapped('contactWhatsapp', body.contactWhatsapp.trim(), SHORT_MAX);
  }
  if (typeof body.footerContent === 'string') {
    setCapped('footerContent', body.footerContent, INTRO_MAX);
  }
  if (typeof body.defaultLanguage === 'string') {
    const lang = body.defaultLanguage === 'nl' || body.defaultLanguage === 'it' ? body.defaultLanguage : 'en';
    setSetting('defaultLanguage', lang);
  }
  if (body.galleryDefaults !== undefined) {
    const store = parseGalleryDefaults(JSON.stringify(body.galleryDefaults));
    saveGalleryDefaults(store);
  }
  logAdmin('settings.update', {
    targetType: 'settings',
    summary: 'Updated site settings',
  });
  return json({ ok: true });
}

export async function DELETE() {
  const denied = await requireAdmin();
  if (denied) return denied;
  fs.rmSync(watermarkPath(), { force: true });
  logAdmin('settings.watermark.remove', {
    targetType: 'settings',
    summary: 'Removed site watermark PNG',
  });
  return json({ ok: true });
}
