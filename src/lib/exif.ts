import type sharp from 'sharp';

export type ExifData = {
  make?: string;
  model?: string;
  lens?: string;
  focalLength?: string;
  aperture?: string;
  shutter?: string;
  iso?: number;
};

/** Whitelist EXIF fields from sharp metadata. GPS is NEVER extracted or stored. */
export function extractExif(meta: sharp.Metadata): {
  exif: ExifData | null;
  capturedAt: number | null;
} {
  const exif = meta.exif ? parseExifBuffer(meta.exif) : null;
  const data: ExifData = {};
  if (exif?.make) data.make = String(exif.make).slice(0, 80);
  if (exif?.model) data.model = String(exif.model).slice(0, 80);
  if (exif?.lens) data.lens = String(exif.lens).slice(0, 120);
  if (exif?.focalLength) data.focalLength = String(exif.focalLength).slice(0, 40);
  if (exif?.aperture) data.aperture = String(exif.aperture).slice(0, 20);
  if (exif?.shutter) data.shutter = String(exif.shutter).slice(0, 20);
  if (typeof exif?.iso === 'number' && exif.iso > 0) data.iso = exif.iso;

  const capturedAt = parseCaptureDate(exif?.dateTimeOriginal ?? exif?.dateTime);
  const hasData = Object.keys(data).length > 0;
  return { exif: hasData ? data : null, capturedAt };
}

type ParsedExif = {
  make?: string;
  model?: string;
  lens?: string;
  focalLength?: string;
  aperture?: string;
  shutter?: string;
  iso?: number;
  dateTimeOriginal?: string;
  dateTime?: string;
};

/** Minimal EXIF tag parser — only whitelisted tags, no GPS. */
function parseExifBuffer(buf: Buffer): ParsedExif | null {
  try {
    const out: ParsedExif = {};
    // sharp embeds IFD tags; scan for known string/number tags only.
    const str = buf.toString('binary');
    const tags: Record<string, keyof ParsedExif> = {
      Make: 'make',
      Model: 'model',
      LensModel: 'lens',
      DateTimeOriginal: 'dateTimeOriginal',
      DateTime: 'dateTime',
    };
    for (const [tag, key] of Object.entries(tags)) {
      const idx = str.indexOf(tag);
      if (idx >= 0) {
        const slice = buf.subarray(Math.max(0, idx), Math.min(buf.length, idx + 256));
        const text = slice.toString('utf8').replace(/[^\x20-\x7E]/g, ' ').trim();
        const match = text.match(new RegExp(`${tag}[\\x00\\s]*([\\x20-\\x7E]{1,120})`));
        if (match?.[1]) (out as Record<string, string>)[key] = match[1].trim();
      }
    }
    // Numeric tags via simple patterns in binary
    const isoMatch = str.match(/ISO[^\d]*(\d{1,5})/);
    if (isoMatch) out.iso = parseInt(isoMatch[1], 10);
    const fMatch = str.match(/FNumber[^\d]*(\d+\.?\d*)/);
    if (fMatch) out.aperture = `f/${fMatch[1]}`;
    const flMatch = str.match(/FocalLength[^\d]*(\d+\.?\d*)/);
    if (flMatch) out.focalLength = `${flMatch[1]}mm`;
    const expMatch = str.match(/ExposureTime[^\d]*(\d+\/?\d*\.?\d*)/);
    if (expMatch) out.shutter = formatShutter(expMatch[1]);
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

function formatShutter(raw: string): string {
  if (raw.includes('/')) return `${raw}s`;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return raw;
  if (n >= 1) return `${n}s`;
  return `1/${Math.round(1 / n)}s`;
}

function parseCaptureDate(raw?: string): number | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    parseInt(m[4], 10),
    parseInt(m[5], 10),
    parseInt(m[6], 10),
  );
  const ts = d.getTime();
  return Number.isNaN(ts) ? null : ts;
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
