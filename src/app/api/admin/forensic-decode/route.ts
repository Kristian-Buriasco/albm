import { extractForensicMarkKey, lookupMarkByKey } from '@/lib/forensic';
import { errorJson, json, requireAdmin } from '@/lib/api';
import { logAdmin } from '@/lib/audit-log';
import { getDb, schema } from '@/db';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorJson('Expected multipart form data', 400);
  }
  const file = form.get('file');
  if (!(file instanceof File)) return errorJson('Missing file', 400);
  if (file.size > 40 * 1024 * 1024) return errorJson('File too large', 413);

  const buf = Buffer.from(await file.arrayBuffer());
  const markKey = await extractForensicMarkKey(buf);
  if (!markKey) {
    return json({ found: false, message: 'No forensic mark detected' });
  }

  const mark = lookupMarkByKey(markKey);
  if (!mark) {
    return json({ found: false, markKey, message: 'Mark key not in database' });
  }

  const visitor = mark.visitorId
    ? getDb()
        .select()
        .from(schema.visitors)
        .where(eq(schema.visitors.id, mark.visitorId))
        .get()
    : null;

  logAdmin('forensic.decode', {
    targetType: 'download_mark',
    targetId: mark.id,
    summary: `Decoded forensic mark for photo ${mark.photoId}`,
  });

  return json({
    found: true,
    markId: mark.id,
    markKey: mark.markKey,
    photoId: mark.photoId,
    galleryId: mark.galleryId,
    visitorId: mark.visitorId,
    accountId: mark.accountId,
    visitorName: visitor?.name ?? null,
    visitorEmail: visitor?.email ?? null,
    at: mark.at,
  });
}
