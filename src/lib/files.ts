import path from 'node:path';

/**
 * Sanitize an uploaded filename: strip any path components and anything
 * that is not a plain, safe filename. Returns null if nothing usable remains.
 */
export function sanitizeFilename(name: string): string | null {
  // Strip path components (both separators, defensively).
  const base = path.basename(name.replaceAll('\\', '/'));
  // Keep letters, digits, dot, dash, underscore, space; collapse the rest.
  const cleaned = base.replace(/[^a-zA-Z0-9._\- ]+/g, '_').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..' || cleaned.startsWith('.')) {
    return null;
  }
  return cleaned;
}

export type ImageType = 'jpeg' | 'png';

/** Detect JPEG/PNG by magic bytes. Returns null for anything else. */
export function detectImageType(buf: Buffer | Uint8Array): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpeg';
  }
  const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length >= 8 && pngMagic.every((b, i) => buf[i] === b)) {
    return 'png';
  }
  return null;
}

/**
 * Resolve filename collisions within a gallery by appending -1, -2, …
 * before the extension. `exists` checks whether a candidate is taken.
 */
export function resolveCollision(
  filename: string,
  exists: (candidate: string) => boolean,
): string {
  if (!exists(filename)) return filename;
  const ext = path.extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  for (let i = 1; ; i++) {
    const candidate = `${stem}-${i}${ext}`;
    if (!exists(candidate)) return candidate;
  }
}
