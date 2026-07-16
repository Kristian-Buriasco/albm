import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './env';

/** Throws if the resolved path escapes $DATA_DIR (defense in depth). */
export function assertInsideDataDir(p: string): string {
  const resolved = path.resolve(p);
  if (resolved !== DATA_DIR && !resolved.startsWith(DATA_DIR + path.sep)) {
    throw new Error(`Path escapes DATA_DIR: ${resolved}`);
  }
  return resolved;
}

export function galleryDir(galleryId: string): string {
  return assertInsideDataDir(path.join(DATA_DIR, 'photos', galleryId));
}

export function originalPath(galleryId: string, filename: string): string {
  return assertInsideDataDir(
    path.join(galleryDir(galleryId), 'originals', filename),
  );
}

function stemOf(filename: string): string {
  const ext = path.extname(filename);
  return filename.slice(0, filename.length - ext.length);
}

function webpBasename(filename: string): string {
  return `${stemOf(filename)}.webp`;
}

/** Working JPEG for RAW archives (derivatives + default client original download). */
export function workingJpegPath(galleryId: string, filename: string): string {
  return assertInsideDataDir(
    path.join(galleryDir(galleryId), 'working', `${stemOf(filename)}.jpg`),
  );
}

export function printPath(galleryId: string, filename: string): string {
  return assertInsideDataDir(
    path.join(galleryDir(galleryId), 'print', `${stemOf(filename)}.jpg`),
  );
}

export function webPath(galleryId: string, filename: string): string {
  return assertInsideDataDir(
    path.join(galleryDir(galleryId), 'web', webpBasename(filename)),
  );
}

export function thumbPath(galleryId: string, filename: string): string {
  return assertInsideDataDir(
    path.join(galleryDir(galleryId), 'thumb', webpBasename(filename)),
  );
}

export function watermarkPath(): string {
  return assertInsideDataDir(path.join(DATA_DIR, 'watermark.png'));
}

export function galleryWatermarkPath(galleryId: string): string {
  return assertInsideDataDir(path.join(galleryDir(galleryId), 'watermark.png'));
}

/** Gallery watermark if present, else global fallback. */
export function resolveWatermarkPath(galleryId: string): string {
  const perGallery = galleryWatermarkPath(galleryId);
  if (fs.existsSync(perGallery)) return perGallery;
  return watermarkPath();
}
