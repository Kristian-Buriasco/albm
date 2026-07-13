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

function webpBasename(filename: string): string {
  const ext = path.extname(filename);
  return `${filename.slice(0, filename.length - ext.length)}.webp`;
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
  return path.join(DATA_DIR, 'watermark.png');
}
