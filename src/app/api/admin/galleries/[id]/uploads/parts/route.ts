import { errorJson, json, requireGalleryCapability } from '@/lib/api';
import { getS3 } from '@/lib/object-store';
import { isPartNumbers, partUrls, stagingKeyOk } from '@/lib/direct-upload';

type Params = { params: Promise<{ id: string }> };

/** Re-signs UploadPart URLs for a multipart direct upload (the first batch comes back from the init call). */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const denied = await requireGalleryCapability(id, 'upload');
  if (denied) return denied;

  const s = getS3();
  if (!s) return errorJson('Object storage is not enabled', 503);

  let body: { key?: unknown; uploadId?: unknown; partNumbers?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorJson('Expected JSON body', 400);
  }
  if (!stagingKeyOk(s, id, body.key)) return errorJson('Invalid key', 400);
  if (typeof body.uploadId !== 'string' || !body.uploadId) return errorJson('Invalid uploadId', 400);
  if (!isPartNumbers(body.partNumbers)) return errorJson('Invalid partNumbers', 400);

  try {
    return json({ parts: await partUrls(s, body.key, body.uploadId, body.partNumbers) });
  } catch (err) {
    console.error('[direct-upload] parts failed', body.key, err);
    return errorJson('Object storage request failed', 502);
  }
}
