import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { getDb, schema } from '@/db';

const MARK_BYTES = 8;
const STRIDE = 17;
const CHANNEL = 2; // blue channel in RGB
const APP_MAGIC = Buffer.from('ALBM\0');

function bitsFromKey(key: Buffer): number[] {
  const bits: number[] = [];
  for (let i = 0; i < key.length; i++) {
    for (let b = 7; b >= 0; b--) {
      bits.push((key[i]! >> b) & 1);
    }
  }
  return bits;
}

function keyFromBits(bits: number[]): Buffer {
  const out = Buffer.alloc(MARK_BYTES);
  for (let i = 0; i < MARK_BYTES; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) {
      v = (v << 1) | (bits[i * 8 + b] ?? 0);
    }
    out[i] = v;
  }
  return out;
}

/** Inject / replace an APP2 segment carrying the mark key (reliable identity). */
function injectApp2Mark(jpeg: Buffer, markKeyHex: string): Buffer {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  const payload = Buffer.concat([APP_MAGIC, Buffer.from(markKeyHex, 'utf8')]);
  const len = payload.length + 2;
  const app2 = Buffer.concat([
    Buffer.from([0xff, 0xe2, (len >> 8) & 0xff, len & 0xff]),
    payload,
  ]);
  // Strip any existing ALBM APP2, then insert after SOI
  const cleaned = stripApp2Marks(jpeg);
  return Buffer.concat([cleaned.subarray(0, 2), app2, cleaned.subarray(2)]);
}

function stripApp2Marks(jpeg: Buffer): Buffer {
  const parts: Buffer[] = [jpeg.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= jpeg.length) {
    if (jpeg[i] !== 0xff) {
      parts.push(jpeg.subarray(i));
      break;
    }
    const marker = jpeg[i + 1]!;
    if (marker === 0xda || marker === 0xd9) {
      parts.push(jpeg.subarray(i));
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      parts.push(jpeg.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const segLen = jpeg.readUInt16BE(i + 2);
    if (segLen < 2 || i + 2 + segLen > jpeg.length) {
      parts.push(jpeg.subarray(i));
      break;
    }
    const seg = jpeg.subarray(i, i + 2 + segLen);
    const isOurs =
      marker === 0xe2 &&
      seg.length >= 4 + APP_MAGIC.length &&
      seg.subarray(4, 4 + APP_MAGIC.length).equals(APP_MAGIC);
    if (!isOurs) parts.push(seg);
    i += 2 + segLen;
  }
  return Buffer.concat(parts);
}

function extractApp2Mark(jpeg: Buffer): string | null {
  let i = 2;
  while (i + 4 <= jpeg.length) {
    if (jpeg[i] !== 0xff) break;
    const marker = jpeg[i + 1]!;
    if (marker === 0xda || marker === 0xd9) break;
    if (marker >= 0xd0 && marker <= 0xd7) {
      i += 2;
      continue;
    }
    const segLen = jpeg.readUInt16BE(i + 2);
    if (segLen < 2 || i + 2 + segLen > jpeg.length) break;
    if (marker === 0xe2) {
      const data = jpeg.subarray(i + 4, i + 2 + segLen);
      if (data.length >= APP_MAGIC.length && data.subarray(0, APP_MAGIC.length).equals(APP_MAGIC)) {
        return data.subarray(APP_MAGIC.length).toString('utf8');
      }
    }
    i += 2 + segLen;
  }
  return null;
}

/** Stronger spatial mark (±4) so moderate JPEG re-encode still carries signal. */
async function embedSpatial(jpegBuf: Buffer, markKeyHex: string): Promise<Buffer> {
  const key = Buffer.from(markKeyHex, 'hex');
  if (key.length !== MARK_BYTES) throw new Error('Invalid mark key length');
  const bits = bitsFromKey(key);
  const payload = [...bits, ...bits, ...bits];

  const { data, info } = await sharp(jpegBuf)
    .rotate()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const pixels = info.width * info.height;
  let bitIdx = 0;
  for (let p = 0; p < pixels && bitIdx < payload.length; p += STRIDE) {
    const off = p * channels + CHANNEL;
    if (off >= data.length) break;
    const bit = payload[bitIdx++]!;
    const base = data[off]! & 0xf8; // clear low 3 bits
    data[off] = bit ? base | 0x04 : base; // encode as 0 or 4 in low bits
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: channels as 3 },
  })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

async function extractSpatial(jpegBuf: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(jpegBuf)
      .rotate()
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    const pixels = info.width * info.height;
    const bitLen = MARK_BYTES * 8;
    const reads: number[][] = [[], [], []];
    let bitIdx = 0;
    for (let p = 0; p < pixels && bitIdx < bitLen * 3; p += STRIDE) {
      const off = p * channels + CHANNEL;
      if (off >= data.length) break;
      const copy = Math.floor(bitIdx / bitLen);
      const local = bitIdx % bitLen;
      reads[copy]![local] = (data[off]! & 0x04) !== 0 ? 1 : 0;
      bitIdx++;
    }
    if (bitIdx < bitLen) return null;
    const voted: number[] = [];
    for (let i = 0; i < bitLen; i++) {
      const sum = (reads[0]![i] ?? 0) + (reads[1]![i] ?? 0) + (reads[2]![i] ?? 0);
      voted.push(sum >= 2 ? 1 : 0);
    }
    return keyFromBits(voted).toString('hex');
  } catch {
    return null;
  }
}

/** Embed an 8-byte mark: spatial stego + APP2 identity tag. */
export async function embedForensicMark(
  jpegBuf: Buffer,
  markKeyHex: string,
): Promise<Buffer> {
  const spatial = await embedSpatial(jpegBuf, markKeyHex);
  return injectApp2Mark(Buffer.from(spatial), markKeyHex);
}

/** Extract mark key — prefer APP2, fall back to spatial. */
export async function extractForensicMarkKey(jpegBuf: Buffer): Promise<string | null> {
  const fromApp = extractApp2Mark(jpegBuf);
  if (fromApp && /^[0-9a-f]{16}$/i.test(fromApp)) return fromApp.toLowerCase();
  return extractSpatial(jpegBuf);
}

export function createDownloadMark(opts: {
  photoId: string;
  galleryId: string;
  visitorId: string | null;
  accountId: string | null;
}): { id: string; markKey: string } {
  const id = nanoid();
  const markKey = crypto.randomBytes(MARK_BYTES).toString('hex');
  getDb()
    .insert(schema.downloadMarks)
    .values({
      id,
      markKey,
      photoId: opts.photoId,
      galleryId: opts.galleryId,
      visitorId: opts.visitorId,
      accountId: opts.accountId,
      at: Date.now(),
    })
    .run();
  return { id, markKey };
}

export function lookupMarkByKey(markKey: string) {
  return getDb()
    .select()
    .from(schema.downloadMarks)
    .where(eq(schema.downloadMarks.markKey, markKey))
    .get();
}
