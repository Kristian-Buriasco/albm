import sharp from 'sharp';

/** Sizes the public icon route serves: tab, Apple touch, Android, and the master itself. */
export const ICON_SIZES = [32, 180, 192, 512] as const;
export type IconSize = (typeof ICON_SIZES)[number];
export const ICON_MASTER: IconSize = 512;

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 50_000_000;

export class IconError extends Error {
  status: 400 | 413 | 415;
  constructor(message: string, status: 400 | 413 | 415) {
    super(message);
    this.name = 'IconError';
    this.status = status;
  }
}

/**
 * SVG is the one format that can carry active content or reach out to other resources
 * (scripts, entities that read local files, external images/CSS). We never serve the upload
 * itself — we rasterise it — but rasterisers can still be made to read `file:` URLs, so
 * anything that is not self-contained is refused outright. Embedded `data:` images and
 * in-document `#fragment` references (gradients, clip paths) remain fine.
 */
const UNSAFE_SVG =
  /<!DOCTYPE|<!ENTITY|<script|<foreignObject|<iframe|<embed|<object|@import|\son[a-z]+\s*=|(?:xlink:)?href\s*=\s*["'](?!#|data:)|url\(\s*["']?(?!#|data:)/i;

function looksLikeSvg(buf: Buffer): boolean {
  const head = buf.subarray(0, 2048).toString('utf8').trimStart();
  return head.startsWith('<') && /<svg[\s>]/i.test(head);
}

/**
 * Turn an uploaded image into the 512×512 transparent PNG master. Non-square images are padded,
 * not stretched or cropped, so a wide wordmark stays whole.
 */
export async function normalizeIcon(input: Buffer): Promise<Buffer> {
  if (input.length === 0) throw new IconError('Empty file', 400);
  if (input.length > MAX_BYTES) throw new IconError('Image too large (max 5 MB)', 413);

  const svg = looksLikeSvg(input);
  if (svg && UNSAFE_SVG.test(input.toString('utf8'))) {
    throw new IconError('This SVG uses scripts or external resources; export a plain SVG or a PNG', 415);
  }

  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !['png', 'jpeg', 'webp', 'svg'].includes(meta.format)) {
      throw new IconError('Use a PNG, JPEG, WebP or SVG image', 415);
    }
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, density: svg ? 300 : undefined })
      .resize(ICON_MASTER, ICON_MASTER, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (err) {
    if (err instanceof IconError) throw err;
    throw new IconError('Could not read that image', 415);
  }
}

/** Derive one served size from the master. */
export function resizeIcon(master: Buffer, size: IconSize): Promise<Buffer> {
  return sharp(master).resize(size, size, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer();
}

export function isIconSize(n: number): n is IconSize {
  return (ICON_SIZES as readonly number[]).includes(n);
}
