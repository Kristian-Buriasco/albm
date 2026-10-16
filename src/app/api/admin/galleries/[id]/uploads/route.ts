import { nanoid } from 'nanoid';
import { errorJson, json, requireGalleryCapability } from '@/lib/api';
import { sanitizeFilename } from '@/lib/files';
import { galleryUsesObjectStore, getS3 } from '@/lib/object-store';
import { isRawFilename } from '@/lib/raw';
import {
  createMultipart,
  MAX_DIRECT_UPLOAD_BYTES,
  MAX_PARTS,
  PART_BYTES,
  partUrls,
  presignPut,
  SINGLE_PUT_MAX_BYTES,
} from '@/lib/direct-upload';

type Params = { params: Promise<{ id: string }> };

/** Starts a browser direct upload. Without object storage the browser falls back to the proxy route. */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const denied = await requireGalleryCapability(id, 'upload');
  if (denied) return denied;

  const s = getS3();
  if (!s || !galleryUsesObjectStore(id)) return json({ mode: 'proxy' });

  let body: { filename?: unknown; size?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorJson('Expected JSON body', 400);
  }
  const filename = typeof body.filename === 'string' ? sanitizeFilename(body.filename) : null;
  if (!filename) return errorJson('Invalid filename', 400);
  if (!isRawFilename(filename) && !/\.(jpe?g|png)$/i.test(filename)) {
    return errorJson('Only JPEG, PNG, and camera RAW (DNG/CR2/CR3/NEF/ARW/…) files are accepted', 415);
  }
  const size = body.size;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) {
    return errorJson('Invalid size', 400);
  }
  if (size > MAX_DIRECT_UPLOAD_BYTES) {
    return errorJson(`File too large (max ${Math.floor(MAX_DIRECT_UPLOAD_BYTES / 1024 / 1024)} MB)`, 413);
  }
  const partCount = Math.ceil(size / PART_BYTES);
  if (size > SINGLE_PUT_MAX_BYTES && partCount > MAX_PARTS) {
    return errorJson('File needs too many upload parts', 413);
  }

  const key = `${s.cfg.prefix}incoming/${id}/${nanoid(16)}/${filename}`;
  try {
    if (size <= SINGLE_PUT_MAX_BYTES) {
      return json({ mode: 'direct', key, putUrl: await presignPut(s, key) });
    }
    const uploadId = await createMultipart(s, key);
    const numbers = Array.from({ length: partCount }, (_, i) => i + 1);
    return json({
      mode: 'direct',
      key,
      uploadId,
      partSize: PART_BYTES,
      parts: await partUrls(s, key, uploadId, numbers),
    });
  } catch (err) {
    console.error('[direct-upload] init failed', key, err);
    return errorJson('Object storage request failed', 502);
  }
}
