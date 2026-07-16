import fs from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import PQueue from 'p-queue';
import sharp from 'sharp';
import { getDb, schema } from '@/db';
import { originalPath, thumbPath, webPath, workingJpegPath } from '@/lib/paths';
import { logAdmin } from '@/lib/audit-log';

/**
 * [decision] @vladmandic/face-api + @tensorflow/tfjs-backend-wasm (CPU/WASM).
 * Avoids onnxruntime-node / tfjs-node native builds that break on Apple clang 10 / macOS 10.13 mini.
 * Face descriptors are 128-dim float32; match via Euclidean distance.
 */
const MATCH_THRESHOLD = 0.55;
const MAX_IMAGE_EDGE = 1024;
const SELFIE_MAX_BYTES = 5 * 1024 * 1024;

type FaceApiModule = {
  tf: {
    setBackend: (b: string) => Promise<boolean>;
    ready: () => Promise<void>;
    getBackend: () => string;
    tensor3d: (
      values: Uint8Array,
      shape: [number, number, number],
    ) => { dispose: () => void };
  };
  nets: {
    tinyFaceDetector: { loadFromDisk: (dir: string) => Promise<void> };
    faceLandmark68TinyNet: { loadFromDisk: (dir: string) => Promise<void> };
    faceRecognitionNet: { loadFromDisk: (dir: string) => Promise<void> };
  };
  TinyFaceDetectorOptions: new (opts: {
    inputSize?: number;
    scoreThreshold?: number;
  }) => unknown;
  detectAllFaces: (
    input: unknown,
    options: unknown,
  ) => {
    withFaceLandmarks: (useTiny?: boolean) => {
      withFaceDescriptors: () => Promise<
        Array<{
          detection: { box: { x: number; y: number; width: number; height: number } };
          descriptor: Float32Array | number[];
        }>
      >;
    };
  };
};

const globalFace = globalThis as unknown as {
  __faceApiReady?: Promise<FaceApiModule>;
  __faceBatchQueue?: PQueue;
};

function modelDir(): string {
  const candidates = [
    path.join(process.cwd(), 'node_modules', '@vladmandic', 'face-api', 'model'),
    path.join(__dirname, '..', '..', 'node_modules', '@vladmandic', 'face-api', 'model'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('face-api model directory not found');
}

async function loadFaceApi(): Promise<FaceApiModule> {
  if (!globalFace.__faceApiReady) {
    globalFace.__faceApiReady = (async () => {
      // WASM build — no native compile. Required for mini deploy.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js') as FaceApiModule;
      await faceapi.tf.setBackend('wasm');
      await faceapi.tf.ready();
      const dir = modelDir();
      await faceapi.nets.tinyFaceDetector.loadFromDisk(dir);
      await faceapi.nets.faceLandmark68TinyNet.loadFromDisk(dir);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(dir);
      return faceapi;
    })().catch((err) => {
      globalFace.__faceApiReady = undefined;
      throw err;
    });
  }
  return globalFace.__faceApiReady;
}

function photoSource(photo: {
  galleryId: string;
  filename: string;
  isRaw: boolean;
}): string {
  const web = webPath(photo.galleryId, photo.filename);
  if (fs.existsSync(web)) return web;
  if (photo.isRaw) {
    const working = workingJpegPath(photo.galleryId, photo.filename);
    if (fs.existsSync(working)) return working;
  }
  const thumb = thumbPath(photo.galleryId, photo.filename);
  if (fs.existsSync(thumb)) return thumb;
  return originalPath(photo.galleryId, photo.filename);
}

async function bufferToTensor(
  faceapi: FaceApiModule,
  buf: Buffer,
): Promise<{ tensor: { dispose: () => void }; dispose: () => void }> {
  const { data, info } = await sharp(buf)
    .rotate()
    .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const tensor = faceapi.tf.tensor3d(new Uint8Array(data), [
    info.height,
    info.width,
    3,
  ]);
  return {
    tensor,
    dispose: () => {
      tensor.dispose();
    },
  };
}

export type DetectedFace = {
  faceIdx: number;
  embedding: Float32Array;
  bbox: { x: number; y: number; w: number; h: number };
};

/** Detect faces + descriptors from an in-memory image buffer (never written to disk). */
export async function detectFacesFromBuffer(buf: Buffer): Promise<DetectedFace[]> {
  if (buf.length > SELFIE_MAX_BYTES) {
    throw new Error('Image too large');
  }
  const faceapi = await loadFaceApi();
  const { tensor, dispose } = await bufferToTensor(faceapi, buf);
  try {
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });
    const results = await faceapi
      .detectAllFaces(tensor, options)
      .withFaceLandmarks(true)
      .withFaceDescriptors();
    return results.map((r, faceIdx) => {
      const box = r.detection.box;
      return {
        faceIdx,
        embedding: new Float32Array(r.descriptor),
        bbox: {
          x: Math.round(box.x),
          y: Math.round(box.y),
          w: Math.round(box.width),
          h: Math.round(box.height),
        },
      };
    });
  } finally {
    dispose();
  }
}

function embeddingToBuffer(emb: Float32Array): Buffer {
  return Buffer.from(emb.buffer, emb.byteOffset, emb.byteLength);
}

function bufferToEmbedding(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function euclidean(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i]! - b[i]!;
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function matchPhotoIds(
  query: Float32Array,
  faces: { photoId: string; embedding: Buffer }[],
  threshold = MATCH_THRESHOLD,
): string[] {
  const scores = new Map<string, number>();
  for (const face of faces) {
    const dist = euclidean(query, bufferToEmbedding(face.embedding));
    if (dist > threshold) continue;
    const prev = scores.get(face.photoId);
    if (prev === undefined || dist < prev) scores.set(face.photoId, dist);
  }
  return [...scores.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id);
}

function getBatchQueue(): PQueue {
  return (globalFace.__faceBatchQueue ??= new PQueue({ concurrency: 1 }));
}

function setBatchProgress(
  galleryId: string,
  patch: {
    faceBatchStatus?: 'idle' | 'running' | 'done' | 'error';
    faceBatchDone?: number;
    faceBatchTotal?: number;
    faceBatchError?: string | null;
  },
): void {
  getDb()
    .update(schema.galleries)
    .set({
      ...patch,
      faceBatchUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    })
    .where(eq(schema.galleries.id, galleryId))
    .run();
}

async function embedPhoto(photo: {
  id: string;
  galleryId: string;
  filename: string;
  isRaw: boolean;
}): Promise<number> {
  const src = photoSource(photo);
  if (!fs.existsSync(src)) return 0;
  const buf = await fs.promises.readFile(src);
  const faces = await detectFacesFromBuffer(buf);
  const db = getDb();
  db.delete(schema.photoFaces).where(eq(schema.photoFaces.photoId, photo.id)).run();
  for (const face of faces) {
    db.insert(schema.photoFaces)
      .values({
        id: nanoid(),
        photoId: photo.id,
        galleryId: photo.galleryId,
        faceIdx: face.faceIdx,
        embedding: embeddingToBuffer(face.embedding),
        bboxX: face.bbox.x,
        bboxY: face.bbox.y,
        bboxW: face.bbox.w,
        bboxH: face.bbox.h,
        createdAt: Date.now(),
      })
      .run();
  }
  return faces.length;
}

/** Start overnight/manual face embedding batch. Non-blocking; progress on gallery row. */
export function startFaceBatch(galleryId: string): { ok: true } | { ok: false; error: string } {
  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, galleryId))
    .get();
  if (!gallery) return { ok: false, error: 'Not found' };
  if (!gallery.faceSearch) return { ok: false, error: 'Face search is off for this gallery' };
  if (gallery.faceBatchStatus === 'running') {
    return { ok: false, error: 'Batch already running' };
  }

  const photos = db
    .select()
    .from(schema.photos)
    .where(and(eq(schema.photos.galleryId, galleryId), eq(schema.photos.status, 'ready')))
    .all();

  setBatchProgress(galleryId, {
    faceBatchStatus: 'running',
    faceBatchDone: 0,
    faceBatchTotal: photos.length,
    faceBatchError: null,
  });

  logAdmin('gallery.face_batch.start', {
    targetType: 'gallery',
    targetId: galleryId,
    summary: `Started face embedding batch for "${gallery.title}" (${photos.length} photos)`,
  });

  void getBatchQueue().add(async () => {
    try {
      let done = 0;
      for (const photo of photos) {
        const current = getDb()
          .select({ faceSearch: schema.galleries.faceSearch })
          .from(schema.galleries)
          .where(eq(schema.galleries.id, galleryId))
          .get();
        if (!current?.faceSearch) {
          setBatchProgress(galleryId, {
            faceBatchStatus: 'error',
            faceBatchError: 'Face search disabled mid-batch',
          });
          return;
        }
        try {
          await embedPhoto(photo);
        } catch (err) {
          console.error(`[face-batch] photo ${photo.id}:`, err);
        }
        done += 1;
        setBatchProgress(galleryId, { faceBatchDone: done });
      }
      setBatchProgress(galleryId, { faceBatchStatus: 'done', faceBatchError: null });
      logAdmin('gallery.face_batch.done', {
        targetType: 'gallery',
        targetId: galleryId,
        summary: `Face embedding batch finished for gallery ${galleryId} (${done}/${photos.length})`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Batch failed';
      setBatchProgress(galleryId, { faceBatchStatus: 'error', faceBatchError: msg });
      logAdmin('gallery.face_batch.error', {
        targetType: 'gallery',
        targetId: galleryId,
        summary: `Face embedding batch failed: ${msg}`,
      });
    }
  });

  return { ok: true };
}

export function purgeGalleryFaces(galleryId: string): number {
  const db = getDb();
  const before = db
    .select({ id: schema.photoFaces.id })
    .from(schema.photoFaces)
    .where(eq(schema.photoFaces.galleryId, galleryId))
    .all().length;
  db.delete(schema.photoFaces).where(eq(schema.photoFaces.galleryId, galleryId)).run();
  setBatchProgress(galleryId, {
    faceBatchStatus: 'idle',
    faceBatchDone: 0,
    faceBatchTotal: 0,
    faceBatchError: null,
  });
  return before;
}

export function getGalleryFaceCount(galleryId: string): number {
  return getDb()
    .select({ id: schema.photoFaces.id })
    .from(schema.photoFaces)
    .where(eq(schema.photoFaces.galleryId, galleryId))
    .all().length;
}

export function loadGalleryFaceEmbeddings(galleryId: string): {
  photoId: string;
  embedding: Buffer;
}[] {
  return getDb()
    .select({
      photoId: schema.photoFaces.photoId,
      embedding: schema.photoFaces.embedding,
    })
    .from(schema.photoFaces)
    .where(eq(schema.photoFaces.galleryId, galleryId))
    .all();
}

export { SELFIE_MAX_BYTES, MATCH_THRESHOLD };
