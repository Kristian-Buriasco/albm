import { errorJson, json, requireGalleryCapability } from '@/lib/api';
import { getS3 } from '@/lib/object-store';
import { abortMultipart, discardObject, stagingKeyOk } from '@/lib/direct-upload';

type Params = { params: Promise<{ id: string }> };

/** Drops a browser direct upload: aborts the multipart upload if any, and deletes the staging object. */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const denied = await requireGalleryCapability(id, 'upload');
  if (denied) return denied;

  const s = getS3();
  if (!s) return errorJson('Object storage is not enabled', 503);

  let body: { key?: unknown; uploadId?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorJson('Expected JSON body', 400);
  }
  if (!stagingKeyOk(s, id, body.key)) return errorJson('Invalid key', 400);
  if (typeof body.uploadId === 'string' && body.uploadId) {
    await abortMultipart(s, body.key, body.uploadId);
  }
  await discardObject(s, body.key);
  return json({ ok: true });
}
