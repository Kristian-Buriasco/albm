import path from 'node:path';
import { createWorker, type Worker } from 'tesseract.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';
import { DATA_DIR } from '@/lib/env';

/** [decision] tesseract.js (WASM) — pure JS, builds on macOS 10.13 / Node 20 mini. Digits only. */
const BIB_WHITELIST = '0123456789';
const MIN_DIGITS = 1;
const MAX_DIGITS = 6;
const MAX_BIBS_PER_PHOTO = 12;

let workerPromise: Promise<Worker> | null = null;

async function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const cachePath = path.join(DATA_DIR, 'tesseract-cache');
      const worker = await createWorker('eng', 1, {
        // Keep logs quiet in production; failures are soft.
        logger: () => undefined,
        cachePath,
      });
      await worker.setParameters({
        tessedit_char_whitelist: BIB_WHITELIST,
        // PSM.SPARSE_TEXT = 11 — digit patches on race photos
        tessedit_pageseg_mode: '11' as never,
      });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Extract digit sequences that look like bib numbers from OCR text. */
export function extractBibNumbers(text: string): string[] {
  const found = new Set<string>();
  const matches = text.match(/\d+/g) ?? [];
  for (const m of matches) {
    const cleaned = m.replace(/^0+/, '') || '0';
    if (cleaned.length < MIN_DIGITS || cleaned.length > MAX_DIGITS) continue;
    // Skip trivial single zeros / noise
    if (cleaned === '0') continue;
    found.add(cleaned);
    if (found.size >= MAX_BIBS_PER_PHOTO) break;
  }
  return [...found];
}

/**
 * Run digit OCR on an image buffer and persist bibs for a photo.
 * Failures are soft — photo stays ready with zero bibs.
 */
export async function detectAndStoreBibs(
  photoId: string,
  galleryId: string,
  imagePathOrBuffer: string | Buffer,
): Promise<string[]> {
  try {
    const worker = await getOcrWorker();
    const result = await worker.recognize(imagePathOrBuffer);
    const numbers = extractBibNumbers(result.data.text ?? '');
    const db = getDb();
    db.delete(schema.photoBibs).where(eq(schema.photoBibs.photoId, photoId)).run();
    for (const number of numbers) {
      db.insert(schema.photoBibs)
        .values({
          id: nanoid(),
          photoId,
          galleryId,
          number,
          createdAt: Date.now(),
        })
        .run();
    }
    return numbers;
  } catch (err) {
    console.error(`[bib-ocr] failed for photo ${photoId}:`, err);
    return [];
  }
}
