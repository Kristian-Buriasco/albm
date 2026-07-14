import type sharp from 'sharp';
import exifReader from 'exif-reader';

export type ExifData = {
  make?: string;
  model?: string;
  lens?: string;
  focalLength?: string;
  aperture?: string;
  shutter?: string;
  iso?: number;
};

/**
 * Whitelist camera EXIF fields from sharp's metadata via exif-reader.
 * GPS is NEVER read: we only ever touch the Image and Photo IFDs, never
 * exif-reader's GPSInfo block, so location can't leak into stored data.
 */
export function extractExif(meta: sharp.Metadata): {
  exif: ExifData | null;
  capturedAt: number | null;
} {
  if (!meta.exif) return { exif: null, capturedAt: null };

  let parsed: ReturnType<typeof exifReader> | null = null;
  try {
    parsed = exifReader(meta.exif);
  } catch {
    return { exif: null, capturedAt: null };
  }

  const image = parsed.Image ?? {};
  const photo = parsed.Photo ?? {};
  // NOTE: parsed.GPSInfo is intentionally never referenced.

  const data: ExifData = {};
  if (typeof image.Make === 'string') data.make = image.Make.trim().slice(0, 80);
  if (typeof image.Model === 'string') data.model = image.Model.trim().slice(0, 80);
  if (typeof photo.LensModel === 'string') {
    data.lens = photo.LensModel.trim().slice(0, 120);
  }
  const focal = numeric(photo.FocalLength);
  if (focal !== null) data.focalLength = `${round(focal)}mm`;
  const fnum = numeric(photo.FNumber);
  if (fnum !== null) data.aperture = `f/${round(fnum)}`;
  const exp = numeric(photo.ExposureTime);
  if (exp !== null) data.shutter = formatShutter(exp);
  const iso = isoValue(photo.ISOSpeedRatings ?? photo.PhotographicSensitivity);
  if (iso !== null) data.iso = iso;

  const capturedAt = toTimestamp(
    photo.DateTimeOriginal ?? photo.DateTimeDigitized ?? image.DateTime,
  );

  const hasData = Object.keys(data).length > 0;
  return { exif: hasData ? data : null, capturedAt };
}

function numeric(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (Array.isArray(v) && typeof v[0] === 'number' && v[0] > 0) return v[0];
  return null;
}

function isoValue(v: unknown): number | null {
  if (typeof v === 'number' && v > 0) return Math.round(v);
  if (Array.isArray(v) && typeof v[0] === 'number' && v[0] > 0) {
    return Math.round(v[0]);
  }
  return null;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatShutter(seconds: number): string {
  if (seconds >= 1) return `${round(seconds)}s`;
  return `1/${Math.round(1 / seconds)}s`;
}

/** exif-reader returns datetime tags as Date objects; also accept strings. */
function toTimestamp(v: unknown): number | null {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
    );
    const t = d.getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

export function formatExifLine(exif: ExifData): string {
  const parts: string[] = [];
  if (exif.make || exif.model) {
    parts.push([exif.make, exif.model].filter(Boolean).join(' '));
  }
  if (exif.lens) parts.push(exif.lens);
  if (exif.focalLength) parts.push(exif.focalLength);
  if (exif.aperture) parts.push(exif.aperture);
  if (exif.shutter) parts.push(exif.shutter);
  if (exif.iso) parts.push(`ISO ${exif.iso}`);
  return parts.join(' · ');
}

export function parseStoredExif(raw: string | null): ExifData | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ExifData;
  } catch {
    return null;
  }
}
