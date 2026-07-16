import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

export const RAW_EXTENSIONS = new Set([
  '.dng',
  '.cr2',
  '.cr3',
  '.nef',
  '.nrw',
  '.arw',
  '.srf',
  '.sr2',
  '.orf',
  '.rw2',
  '.pef',
  '.raf',
  '.raw',
  '.rwl',
  '.3fr',
  '.fff',
]);

export const MAX_RAW_UPLOAD_BYTES = 100 * 1024 * 1024;

export function isRawFilename(filename: string): boolean {
  return RAW_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

export function rawFormatFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  return ext || 'raw';
}

/** Detect TIFF-based DNG / II* or MM* header, or common proprietary RAW signatures. */
export function looksLikeRaw(buf: Buffer): boolean {
  if (buf.length < 8) return false;
  if (
    (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
    (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)
  ) {
    return true;
  }
  if (buf.length >= 10 && buf[8] === 0x43 && buf[9] === 0x52) return true;
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 4, 8) === 'ftyp' &&
    buf.toString('ascii', 8, 12).toLowerCase().includes('crx')
  ) {
    return true;
  }
  return false;
}

/**
 * Extract the largest plausible embedded JPEG from a RAW buffer.
 * Most camera RAW files embed a full-size or large JPEG preview.
 */
export function extractEmbeddedJpeg(buf: Buffer): Buffer | null {
  const candidates: Buffer[] = [];
  let i = 0;
  while (i < buf.length - 4) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff) {
      let j = i + 2;
      while (j < buf.length - 1) {
        if (buf[j] === 0xff && buf[j + 1] === 0xd9) {
          const slice = buf.subarray(i, j + 2);
          if (slice.length >= 2_000) candidates.push(Buffer.from(slice));
          i = j + 2;
          break;
        }
        j++;
      }
      if (j >= buf.length - 1) break;
      continue;
    }
    i++;
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] ?? null;
}

async function trySharpDecode(buf: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buf, { failOn: 'none' })
      .rotate()
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}

async function tryDcraw(buf: Buffer): Promise<Buffer | null> {
  const bin = process.env.DCRAW_PATH || 'dcraw';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'albm-raw-'));
  const inPath = path.join(tmpDir, 'in.raw');
  try {
    fs.writeFileSync(inPath, buf);
    const preview = spawnSync(bin, ['-e', '-c', inPath], {
      encoding: 'buffer',
      maxBuffer: 80 * 1024 * 1024,
      timeout: 60_000,
    });
    if (preview.status === 0 && preview.stdout && preview.stdout.length > 1000) {
      const out = Buffer.from(preview.stdout);
      if (out[0] === 0xff && out[1] === 0xd8) return out;
      try {
        return await sharp(out).jpeg({ quality: 92 }).toBuffer();
      } catch {
        /* continue */
      }
    }
    const demosaic = spawnSync(bin, ['-w', '-c', inPath], {
      encoding: 'buffer',
      maxBuffer: 200 * 1024 * 1024,
      timeout: 120_000,
    });
    if (demosaic.status === 0 && demosaic.stdout && demosaic.stdout.length > 1000) {
      try {
        return await sharp(Buffer.from(demosaic.stdout)).jpeg({ quality: 92 }).toBuffer();
      } catch {
        return null;
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Produce a working JPEG from a RAW buffer, or null if undecodable.
 * Order: sharp (DNG/TIFF) → embedded JPEG preview → dcraw if installed.
 */
export async function decodeRawToJpeg(buf: Buffer): Promise<Buffer | null> {
  const fromSharp = await trySharpDecode(buf);
  if (fromSharp) return fromSharp;

  const embedded = extractEmbeddedJpeg(buf);
  if (embedded) {
    try {
      return await sharp(embedded).rotate().jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    } catch {
      /* continue */
    }
  }

  return tryDcraw(buf);
}
