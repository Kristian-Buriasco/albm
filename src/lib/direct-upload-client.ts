import type { Photo } from '@/db/schema';

/**
 * Browser-side direct-to-bucket upload. Talks to the server's /uploads routes
 * (same-origin JSON, cookies sent automatically) and to presigned bucket URLs
 * (no credentials, no custom headers). Callers fall back to the proxy path.
 */

/** The proxy route rejects anything larger; direct failures above this cannot fall back. */
export const PROXY_MAX_BYTES = 50 * 1024 * 1024;

const PART_CONCURRENCY = 3;
const PART_RETRIES = 3;

export interface PartUrl {
  partNumber: number;
  url: string;
}

export interface SinglePlan {
  mode: 'direct';
  key: string;
  putUrl: string;
}

export interface MultipartPlan {
  mode: 'direct';
  key: string;
  uploadId: string;
  partSize: number;
  parts: PartUrl[];
}

export type DirectPlan = SinglePlan | MultipartPlan;

export type DirectResult =
  | { duplicate: false; photo: Photo }
  | { duplicate: true; existingFilename: string };

interface CompletedPart {
  partNumber: number;
  etag: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Null means use the proxy path: store off, or the init call failed. */
export async function requestDirectUpload(
  galleryId: string,
  file: File,
): Promise<DirectPlan | null> {
  try {
    const res = await fetch(`/api/admin/galleries/${galleryId}/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, size: file.size, contentType: file.type }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { mode: 'proxy' } | DirectPlan;
    return data.mode === 'direct' ? data : null;
  } catch {
    return null;
  }
}

/** Resolves with the HTTP status (0 = network or CORS failure) and the ETag header. */
function put(
  url: string,
  body: Blob,
  contentType: string | undefined,
  onLoaded: (bytes: number) => void,
): Promise<{ status: number; etag: string | null }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.withCredentials = false;
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onLoaded(e.loaded);
    };
    xhr.onload = () => resolve({ status: xhr.status, etag: xhr.getResponseHeader('ETag') });
    xhr.onerror = () => resolve({ status: 0, etag: null });
    xhr.send(body);
  });
}

async function requestPartUrls(
  galleryId: string,
  key: string,
  uploadId: string,
  partNumbers: number[],
): Promise<PartUrl[]> {
  const res = await fetch(`/api/admin/galleries/${galleryId}/uploads/parts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, uploadId, partNumbers }),
  });
  if (!res.ok) throw new Error(`part URL refresh failed (HTTP ${res.status})`);
  return ((await res.json()) as { parts: PartUrl[] }).parts;
}

async function uploadMultipart(
  galleryId: string,
  file: File,
  plan: MultipartPlan,
  onProgress: (fraction: number) => void,
): Promise<CompletedPart[]> {
  const { key, uploadId, partSize } = plan;
  const count = Math.ceil(file.size / partSize);
  const urls = new Map(plan.parts.map((p) => [p.partNumber, p.url]));
  const loaded = new Array<number>(count).fill(0);
  const report = () => onProgress(loaded.reduce((a, b) => a + b, 0) / file.size);
  const done: CompletedPart[] = [];
  let next = 1;
  let failed = false;

  async function uploadPart(n: number): Promise<string> {
    const start = (n - 1) * partSize;
    const blob = file.slice(start, Math.min(start + partSize, file.size));
    let status = 0;
    for (let attempt = 0; attempt <= PART_RETRIES; attempt++) {
      if (failed) throw new Error('multipart upload aborted');
      if (attempt > 0) {
        await sleep(1000 * 2 ** (attempt - 1));
        // 403 on a presigned PUT means the URL expired; mint a fresh one before retrying.
        if (status === 403) {
          for (const p of await requestPartUrls(galleryId, key, uploadId, [n])) {
            urls.set(p.partNumber, p.url);
          }
        }
      }
      const url = urls.get(n);
      if (!url) throw new Error(`no upload URL for part ${n}`);
      loaded[n - 1] = 0;
      const res = await put(url, blob, undefined, (b) => {
        loaded[n - 1] = b;
        report();
      });
      if (res.status >= 200 && res.status < 300) {
        // Without the ETag header the bucket's CORS config is missing ExposeHeaders; retrying won't help.
        if (!res.etag) throw new Error(`part ${n}: no ETag returned (check bucket CORS ExposeHeaders)`);
        loaded[n - 1] = blob.size;
        report();
        return res.etag;
      }
      status = res.status;
    }
    throw new Error(`part ${n} failed (HTTP ${status})`);
  }

  const worker = async () => {
    while (!failed && next <= count) {
      const n = next++;
      try {
        done.push({ partNumber: n, etag: await uploadPart(n) });
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, count) }, worker));
  return done.sort((a, b) => a.partNumber - b.partNumber);
}

/** Throws on any bucket or complete failure; the caller then aborts and falls back. */
export async function uploadDirect(
  galleryId: string,
  file: File,
  plan: DirectPlan,
  sectionId: string | null,
  onProgress: (fraction: number) => void,
): Promise<DirectResult> {
  let completion: { uploadId?: string; parts?: CompletedPart[] } = {};
  if ('parts' in plan) {
    completion = {
      uploadId: plan.uploadId,
      parts: await uploadMultipart(galleryId, file, plan, onProgress),
    };
  } else {
    const res = await put(plan.putUrl, file, file.type || undefined, (b) =>
      onProgress(b / file.size),
    );
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`bucket PUT failed (HTTP ${res.status})`);
    }
  }

  const res = await fetch(`/api/admin/galleries/${galleryId}/uploads/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: plan.key,
      ...completion,
      filename: file.name,
      size: file.size,
      sectionId: sectionId ?? undefined,
    }),
  });
  if (res.status === 201) return { duplicate: false, photo: (await res.json()) as Photo };
  if (res.status === 200) {
    const data = (await res.json()) as { duplicate?: boolean; existingFilename?: string };
    if (data.duplicate) {
      return { duplicate: true, existingFilename: data.existingFilename ?? file.name };
    }
  }
  throw new Error(`complete failed (HTTP ${res.status})`);
}

/** Best effort: releases the multipart upload or key so nothing is left orphaned in the bucket. */
export async function abortDirectUpload(galleryId: string, plan: DirectPlan): Promise<void> {
  try {
    await fetch(`/api/admin/galleries/${galleryId}/uploads/abort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: plan.key,
        uploadId: 'uploadId' in plan ? plan.uploadId : undefined,
      }),
    });
  } catch {
    /* best effort */
  }
}
