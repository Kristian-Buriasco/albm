import { errorJson, json, requireGalleryCapability } from '@/lib/api';
import { sanitizeFilename } from '@/lib/files';
import { getS3 } from '@/lib/object-store';
import { getPrincipal } from '@/lib/session';
import { ingestGalleryPhoto } from '@/lib/photo-upload';
import {
  abortMultipart,
  completeMultipart,
  discardObject,
  getObject,
  headSize,
  MAX_DIRECT_UPLOAD_BYTES,
  stagingKeyOk,
} from '@/lib/direct-upload';

type Params = { params: Promise<{ id: string }> };

/**
 * Pulls a browser-staged original out of the bucket and ingests it like a proxied upload.
 * The staging object is always deleted afterwards, whatever the outcome.
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const denied = await requireGalleryCapability(id, 'upload');
  if (denied) return denied;

  const s = getS3();
  if (!s) return errorJson('Object storage is not enabled', 503);

  let body: { key?: unknown; uploadId?: unknown; parts?: unknown; filename?: unknown; sectionId?: unknown; size?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorJson('Expected JSON body', 400);
  }
  if (!stagingKeyOk(s, id, body.key)) return errorJson('Invalid key', 400);
  const key = body.key;
  const filename = typeof body.filename === 'string' ? sanitizeFilename(body.filename) : null;
  if (!filename) return errorJson('Invalid filename', 400);
  const sectionId = typeof body.sectionId === 'string' ? body.sectionId : null;

  const uploadId = typeof body.uploadId === 'string' && body.uploadId ? body.uploadId : null;
  const parts = Array.isArray(body.parts)
    ? (body.parts as { partNumber?: unknown; etag?: unknown }[])
    : null;
  if (uploadId) {
    const ok =
      parts !== null &&
      parts.length > 0 &&
      parts.every(
        (p) =>
          Number.isInteger(p.partNumber) &&
          (p.partNumber as number) >= 1 &&
          typeof p.etag === 'string' &&
          p.etag.length > 0 &&
          p.etag.length <= 128,
      );
    if (!ok) return errorJson('Invalid parts', 400);
  }

  let result;
  try {
    if (uploadId) {
      await completeMultipart(
        s,
        key,
        uploadId,
        parts!.map((p) => ({ partNumber: p.partNumber as number, etag: p.etag as string })),
      );
    }
    const size = await headSize(s, key);
    if (size === null) return errorJson('Uploaded file not found', 404);
    if (size <= 0 || size > MAX_DIRECT_UPLOAD_BYTES) return errorJson('Uploaded file has an invalid size', 413);
    // The browser sends the file's real size; a skipped or truncated part would otherwise pass.
    if (typeof body.size === 'number' && body.size !== size) {
      return errorJson('Upload incomplete: size does not match', 409);
    }

    // Buffers the original in memory, like the proxy upload path does (max 500 MB by default).
    const buf = await getObject(s, key);
    const file = new File([buf], filename);
    const principal = await getPrincipal();
    const uploadedBy = principal?.role === 'collaborator' ? principal.collaboratorId : null;
    result = await ingestGalleryPhoto(id, file, sectionId, {
      uploadedBy,
      maxBytes: MAX_DIRECT_UPLOAD_BYTES,
    });
  } catch (err) {
    console.error('[direct-upload] complete failed', key, err);
    if (uploadId) await abortMultipart(s, key, uploadId);
    return errorJson('Object storage request failed', 502);
  } finally {
    await discardObject(s, key);
  }

  if (!result.ok) return errorJson(result.error, result.status);
  if ('duplicate' in result && result.duplicate) {
    return json({ duplicate: true, existingFilename: result.existingFilename });
  }
  if (result.ok && result.created) {
    return json(result.photo, 201);
  }
  return errorJson('Upload failed', 500);
}
