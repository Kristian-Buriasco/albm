import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Gallery, Photo } from '@/db/schema';
import {
  createDownloadMark,
  embedForensicMark,
} from '@/lib/forensic';
import {
  originalPath,
  printPath,
  webPath,
  workingJpegPath,
} from '@/lib/paths';
import { stripGpsFromJpeg } from '@/lib/exif-strip';

export type DownloadSize = 'web' | 'print' | 'original';

export const PRINT_LONG_EDGE = 3000;

export function parseDownloadSize(raw: string | null): DownloadSize | null {
  if (raw === 'web' || raw === 'print' || raw === 'original') return raw;
  return null;
}

export function sizeAllowed(gallery: Gallery, size: DownloadSize): boolean {
  switch (size) {
    case 'web':
      return gallery.downloadOfferWeb;
    case 'print':
      return gallery.downloadOfferPrint;
    case 'original':
      return gallery.downloadOfferOriginal;
  }
}

/** Default size when client omits ?size= — preserves prior “original” behavior. */
export function defaultDownloadSize(gallery: Gallery): DownloadSize {
  if (gallery.downloadOfferOriginal) return 'original';
  if (gallery.downloadOfferPrint) return 'print';
  if (gallery.downloadOfferWeb) return 'web';
  return 'original';
}

export function downloadFilename(photo: Photo, size: DownloadSize, asJpeg: boolean): string {
  const ext = path.extname(photo.filename);
  const stem = photo.filename.slice(0, photo.filename.length - ext.length);
  if (size === 'web') return `${stem}-web.webp`;
  if (size === 'print') return `${stem}-print.jpg`;
  if (asJpeg) return `${stem}.jpg`;
  return photo.filename;
}

async function ensurePrintDerivative(photo: Photo): Promise<string> {
  const out = printPath(photo.galleryId, photo.filename);
  if (fs.existsSync(out)) return out;
  const src = photo.isRaw
    ? workingJpegPath(photo.galleryId, photo.filename)
    : originalPath(photo.galleryId, photo.filename);
  if (!fs.existsSync(src)) throw new Error('Source missing');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(src)
    .rotate()
    .resize(PRINT_LONG_EDGE, PRINT_LONG_EDGE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(out);
  return out;
}

/**
 * Strip GPS always (unless allowGpsInDownload). When keepExifOnDownload is off,
 * also drop capture EXIF (orientation already applied via rotate). When on,
 * preserve non-GPS EXIF via surgical GPS strip when possible.
 */
export async function applyExifPolicy(
  buf: Buffer,
  gallery: Gallery,
): Promise<Buffer> {
  if (gallery.allowGpsInDownload && gallery.keepExifOnDownload) {
    return buf;
  }

  if (gallery.keepExifOnDownload && !gallery.allowGpsInDownload) {
    const stripped = stripGpsFromJpeg(buf);
    if (stripped) return stripped;
    // Fallback: re-encode without EXIF rather than risk leaking GPS
    return sharp(buf)
      .rotate()
      .jpeg({ quality: 95, mozjpeg: true, force: true })
      .toBuffer();
  }

  if (gallery.allowGpsInDownload && !gallery.keepExifOnDownload) {
    // Odd combo: strip most EXIF but... GPS opt-in without keepExif still strips.
    // Spec: GPS never without allowGps; without keepExif drop capture tags.
    return sharp(buf)
      .rotate()
      .jpeg({ quality: 95, mozjpeg: true, force: true })
      .toBuffer();
  }

  // Default: strip GPS + most EXIF
  const stripped = stripGpsFromJpeg(buf);
  if (stripped && !gallery.keepExifOnDownload) {
    // Still drop remaining EXIF for default policy
    return sharp(stripped)
      .rotate()
      .jpeg({ quality: 95, mozjpeg: true, force: true })
      .toBuffer();
  }

  return sharp(buf)
    .rotate()
    .jpeg({ quality: 95, mozjpeg: true, force: true })
    .toBuffer();
}

export type PrepareDownloadOpts = {
  gallery: Gallery;
  photo: Photo;
  size: DownloadSize;
  visitorId: string | null;
  accountId: string | null;
};

export type PreparedDownload = {
  body: Buffer | null;
  filePath: string | null;
  contentType: string;
  downloadName: string;
  /** When true, stream filePath; otherwise send body Buffer. */
  streamFile: boolean;
};

/**
 * Build the bytes (or path) for a client download, applying size, RAW→JPEG,
 * forensic mark, and EXIF/GPS policy.
 */
export async function preparePhotoDownload(
  opts: PrepareDownloadOpts,
): Promise<PreparedDownload> {
  const { gallery, photo, size, visitorId, accountId } = opts;

  if (size === 'web') {
    const wp = webPath(photo.galleryId, photo.filename);
    let buf: Buffer = fs.readFileSync(wp);
    // Web is WebP — convert to JPEG if forensic needed (stego is JPEG-oriented)
    if (gallery.forensicWatermark) {
      buf = Buffer.from(await sharp(buf).jpeg({ quality: 90 }).toBuffer());
      const mark = createDownloadMark({
        photoId: photo.id,
        galleryId: gallery.id,
        visitorId,
        accountId,
      });
      buf = Buffer.from(await embedForensicMark(buf, mark.markKey));
      return {
        body: buf,
        filePath: null,
        contentType: 'image/jpeg',
        downloadName: downloadFilename(photo, 'web', true).replace(/\.webp$/, '.jpg'),
        streamFile: false,
      };
    }
    return {
      body: null,
      filePath: wp,
      contentType: 'image/webp',
      downloadName: downloadFilename(photo, 'web', false),
      streamFile: true,
    };
  }

  if (size === 'print') {
    const pp = await ensurePrintDerivative(photo);
    let buf: Buffer = fs.readFileSync(pp);
    buf = Buffer.from(await applyExifPolicy(buf, gallery));
    if (gallery.forensicWatermark) {
      const mark = createDownloadMark({
        photoId: photo.id,
        galleryId: gallery.id,
        visitorId,
        accountId,
      });
      buf = Buffer.from(await embedForensicMark(buf, mark.markKey));
    }
    return {
      body: buf,
      filePath: null,
      contentType: 'image/jpeg',
      downloadName: downloadFilename(photo, 'print', true),
      streamFile: false,
    };
  }

  // original
  const deliverRawFile = photo.isRaw && gallery.deliverRaw;
  const srcPath = deliverRawFile
    ? originalPath(photo.galleryId, photo.filename)
    : photo.isRaw
      ? workingJpegPath(photo.galleryId, photo.filename)
      : originalPath(photo.galleryId, photo.filename);

  if (!fs.existsSync(srcPath)) {
    throw new Error('File missing');
  }

  const asJpeg = photo.isRaw && !gallery.deliverRaw;
  const needsTransform =
    gallery.forensicWatermark ||
    (!deliverRawFile &&
      (!gallery.allowGpsInDownload || !gallery.keepExifOnDownload));

  // RAW file delivery: never forensically mark binary RAW; stream as-is.
  if (deliverRawFile) {
    return {
      body: null,
      filePath: srcPath,
      contentType: 'application/octet-stream',
      downloadName: photo.filename,
      streamFile: true,
    };
  }

  if (!needsTransform && !asJpeg) {
    // Byte-identical path: forensic off + EXIF policy allows streaming
    // (keepExif + allowGps, or we still need strip — needsTransform covers strip).
    return {
      body: null,
      filePath: srcPath,
      contentType: contentTypeFor(photo.filename),
      downloadName: photo.filename,
      streamFile: true,
    };
  }

  // When forensic off and only GPS/EXIF strip: still transform.
  // Special case: forensic off + allowGps + keepExif → already handled.
  // forensic off + default strip: transform.
  if (!gallery.forensicWatermark && gallery.allowGpsInDownload && gallery.keepExifOnDownload) {
    return {
      body: null,
      filePath: srcPath,
      contentType: asJpeg ? 'image/jpeg' : contentTypeFor(photo.filename),
      downloadName: downloadFilename(photo, 'original', asJpeg),
      streamFile: true,
    };
  }

  let buf: Buffer = fs.readFileSync(srcPath);

  // Ensure JPEG for forensic / EXIF pipeline (PNG originals → jpeg)
  const lower = srcPath.toLowerCase();
  if (!lower.endsWith('.jpg') && !lower.endsWith('.jpeg')) {
    buf = Buffer.from(await sharp(buf).jpeg({ quality: 95, mozjpeg: true }).toBuffer());
  }

  // EXIF/GPS policy first; forensic mark last so APP2 / spatial survive.
  buf = Buffer.from(await applyExifPolicy(buf, gallery));

  if (gallery.forensicWatermark) {
    const mark = createDownloadMark({
      photoId: photo.id,
      galleryId: gallery.id,
      visitorId,
      accountId,
    });
    buf = Buffer.from(await embedForensicMark(buf, mark.markKey));
  }

  return {
    body: buf,
    filePath: null,
    contentType: 'image/jpeg',
    downloadName: downloadFilename(photo, 'original', true),
    streamFile: false,
  };
}

function contentTypeFor(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

export function bufferResponse(
  body: Buffer,
  opts: { contentType: string; downloadName: string },
): Response {
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': opts.contentType,
      'Content-Length': String(body.length),
      'Content-Disposition': `attachment; filename="${opts.downloadName.replaceAll('"', '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
