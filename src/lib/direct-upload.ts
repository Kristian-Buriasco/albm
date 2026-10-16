import type { AwsClient } from 'aws4fetch';
import { objectUrl, type ObjectStoreConfig } from './object-store';

/**
 * Browser direct uploads: the browser PUTs the original to a staging key in the bucket with
 * presigned URLs, then the server pulls it back, ingests it and deletes the staging object.
 * Nothing is stored between the steps; the staging key carries all the state.
 */

export const MAX_DIRECT_UPLOAD_BYTES = (Number(process.env.MAX_DIRECT_UPLOAD_MB) || 500) * 1024 * 1024;
/** Up to this size one presigned PUT; above it multipart. */
export const SINGLE_PUT_MAX_BYTES = 32 * 1024 * 1024;
export const PART_BYTES = 16 * 1024 * 1024;
export const MAX_PARTS = 10000;
const PUT_TTL_SECONDS = 900;
const PART_TTL_SECONDS = 3600;

export type S3 = { c: AwsClient; cfg: ObjectStoreConfig };

/** Staging keys must sit under this gallery's incoming/ folder. */
export function stagingKeyOk(s: S3, galleryId: string, key: unknown): key is string {
  return (
    typeof key === 'string' &&
    key.startsWith(`${s.cfg.prefix}incoming/${galleryId}/`) &&
    !key.includes('..')
  );
}

/** Presigned URL: the signature sits in the query string, so the browser needs no credentials. */
async function presign(s: S3, url: string, ttlSeconds: number): Promise<string> {
  const u = new URL(url);
  u.searchParams.set('X-Amz-Expires', String(ttlSeconds));
  const signed = await s.c.sign(new Request(u, { method: 'PUT' }), { aws: { signQuery: true } });
  return signed.url;
}

export function presignPut(s: S3, key: string): Promise<string> {
  return presign(s, objectUrl(s.cfg, key), PUT_TTL_SECONDS);
}

/** Part numbers from a JSON body: 1..MAX_PARTS integers, non-empty, bounded length. */
export function isPartNumbers(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.length <= MAX_PARTS &&
    v.every((n) => Number.isInteger(n) && n >= 1 && n <= MAX_PARTS)
  );
}

export async function createMultipart(s: S3, key: string): Promise<string> {
  const res = await s.c.fetch(`${objectUrl(s.cfg, key)}?uploads`, { method: 'POST' });
  const id = /<UploadId>([^<]+)<\/UploadId>/.exec(await res.text())?.[1];
  if (!res.ok || !id) throw new Error(`S3 CreateMultipartUpload -> ${res.status}`);
  return id;
}

export function partUrls(
  s: S3,
  key: string,
  uploadId: string,
  partNumbers: number[],
): Promise<{ partNumber: number; url: string }[]> {
  return Promise.all(
    partNumbers.map(async (partNumber) => {
      const url = `${objectUrl(s.cfg, key)}?partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`;
      return { partNumber, url: await presign(s, url, PART_TTL_SECONDS) };
    }),
  );
}

/** S3 can answer 200 with an <Error> body, so that is checked as well as the status. */
export async function completeMultipart(
  s: S3,
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  const xmlParts = [...parts]
    .sort((a, b) => a.partNumber - b.partNumber)
    .map(
      (p) =>
        `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</ETag></Part>`,
    )
    .join('');
  const res = await s.c.fetch(`${objectUrl(s.cfg, key)}?uploadId=${encodeURIComponent(uploadId)}`, {
    method: 'POST',
    body: `<CompleteMultipartUpload>${xmlParts}</CompleteMultipartUpload>`,
    headers: { 'Content-Type': 'application/xml' },
  });
  const text = await res.text();
  if (!res.ok || text.includes('<Error>')) throw new Error(`S3 CompleteMultipartUpload -> ${res.status}`);
}

/** Staged object size in bytes, or null when it does not exist. */
export async function headSize(s: S3, key: string): Promise<number | null> {
  const res = await s.c.fetch(objectUrl(s.cfg, key), { method: 'HEAD' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`S3 HEAD -> ${res.status}`);
  return Number(res.headers.get('content-length') ?? 0);
}

/** Buffers the whole original in memory, like the proxy upload path does. */
export async function getObject(s: S3, key: string): Promise<Uint8Array<ArrayBuffer>> {
  const res = await s.c.fetch(objectUrl(s.cfg, key), { method: 'GET' });
  if (!res.ok) throw new Error(`S3 GET -> ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function bestEffortDelete(s: S3, url: string): Promise<void> {
  try {
    const res = await s.c.fetch(url, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) console.error(`[direct-upload] delete -> ${res.status}`);
  } catch (err) {
    console.error('[direct-upload] delete failed', err);
  }
}

export function discardObject(s: S3, key: string): Promise<void> {
  return bestEffortDelete(s, objectUrl(s.cfg, key));
}

export function abortMultipart(s: S3, key: string, uploadId: string): Promise<void> {
  return bestEffortDelete(s, `${objectUrl(s.cfg, key)}?uploadId=${encodeURIComponent(uploadId)}`);
}
