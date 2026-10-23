import fs from 'node:fs';
import sharp from 'sharp';
import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { ensureLocalDerivative } from './object-store';
import { mdPath, webPath } from './paths';

export const SLIDE_W = 1080;
export const SLIDE_H = 1350; // Instagram 4:5, the tallest feed crop
export const MAX_SLIDES = 10;
const MAX_CANDIDATES = 40;
const CLIP_MAX = 0.35; // more than this share of pure white/black = blown out or crushed
const MEAN_MIN = 45; // average brightness outside this band = badly over/underexposed
const MEAN_MAX = 185;
const DUPE_BITS = 8;
const DIVERSE_BITS = 16; // picks should differ by at least this much, or the carousel is ten of the same group shot // dHash hamming distance at or under this = same moment

export type Candidate = { id: string; filename: string; sharp: number; hash: bigint; capturedAt: number | null; score?: number; clipped: number; mean: number };

/** 9x8 grayscale -> 64-bit difference hash, plus Laplacian variance as a sharpness score. */
async function measure(file: string): Promise<{ sharp: number; hash: bigint; clipped: number; mean: number }> {
  const small = await sharp(file).rotate().greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let hash = 0n;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) hash = (hash << 1n) | (small[y * 9 + x] > small[y * 9 + x + 1] ? 1n : 0n);
  const { data, info } = await sharp(file).rotate().greyscale().resize(256, 256, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  let clipped = 0;
  let bright = 0;
  for (const v of data) {
    if (v >= 250 || v <= 5) clipped++;
    bright += v;
  }
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w];
      sum += l;
      sumSq += l * l;
      n++;
    }
  const mean = sum / n;
  return { sharp: sumSq / n - mean * mean, hash, clipped: clipped / data.length, mean: bright / data.length };
}

function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let c = 0;
  while (x) {
    c += Number(x & 1n);
    x >>= 1n;
  }
  return c;
}

/** Ready photos, blown-out or crushed ones dropped, near-duplicates collapsed to the sharpest, thinned to an even spread over time. */
export async function candidates(galleryId: string): Promise<Candidate[]> {
  const rows = getDb()
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.galleryId, galleryId))
    .orderBy(asc(schema.photos.capturedAt), asc(schema.photos.sortOrder))
    .all()
    .filter((p) => p.status === 'ready');
  const measured: Candidate[] = [];
  for (const p of rows) {
    await ensureLocalDerivative(galleryId, 'md', p.filename);
    const file = mdPath(galleryId, p.filename);
    if (!fs.existsSync(file)) continue;
    try {
      const m = await measure(file);
      if (m.clipped <= CLIP_MAX && m.mean >= MEAN_MIN && m.mean <= MEAN_MAX) measured.push({ id: p.id, filename: p.filename, capturedAt: p.capturedAt, ...m });
    } catch {
      /* unreadable derivative: skip it */
    }
  }
  // Bursts are adjacent in time, so comparing to the previous keeper is enough.
  const kept: Candidate[] = [];
  for (const c of measured) {
    const prev = kept[kept.length - 1];
    if (prev && hamming(prev.hash, c.hash) <= DUPE_BITS) {
      if (c.sharp > prev.sharp) kept[kept.length - 1] = c;
    } else kept.push(c);
  }
  if (kept.length <= MAX_CANDIDATES) return kept;
  // Over the cap: split into even time buckets and keep the sharpest of each.
  const out: Candidate[] = [];
  for (let b = 0; b < MAX_CANDIDATES; b++) {
    const slice = kept.slice(Math.floor((b * kept.length) / MAX_CANDIDATES), Math.floor(((b + 1) * kept.length) / MAX_CANDIDATES));
    out.push(slice.reduce((a, c) => (c.sharp > a.sharp ? c : a)));
  }
  return out;
}

/** Best (model score, else sharpness) per even time slice, preferring frames unlike those already picked. */
export function localPicks(c: Candidate[], count: number): Candidate[] {
  if (c.length <= count) return c;
  const rank = (x: Candidate) => x.score ?? x.sharp;
  const out: Candidate[] = [];
  for (let b = 0; b < count; b++) {
    const slice = c.slice(Math.floor((b * c.length) / count), Math.floor(((b + 1) * c.length) / count)).sort((x, y) => rank(y) - rank(x));
    out.push(slice.find((x) => out.every((o) => hamming(o.hash, x.hash) >= DIVERSE_BITS)) ?? slice[0]);
  }
  return out;
}

const PROMPT = (n: number, count: number, title: string) =>
  `You are picking an Instagram carousel from a photo shoot called "${title}". Below are ${n} photos numbered 1-${n}, in shoot order.\n` +
  `Choose the ${count} strongest and put them in the best carousel order: a striking opener, then variety (angles, moments, people, details), and a strong closer. ` +
  `Prefer sharp, well-exposed, well-composed images with emotion or action; avoid near-duplicates and awkward expressions. ` +
  `Reply with only JSON: {"picks":[<photo numbers in carousel order>],"caption":"<a short factual caption, no hashtags>"}`;

/** One vision call over small previews. Throws on any API or parse problem. */
export async function pickWithClaude(c: Candidate[], galleryId: string, title: string, count: number, apiKey: string): Promise<{ picks: Candidate[]; caption: string }> {
  const content: Record<string, unknown>[] = [];
  for (let i = 0; i < c.length; i++) {
    const jpeg = await sharp(mdPath(galleryId, c[i].filename)).rotate().resize(768, 768, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
    content.push({ type: 'text', text: `Photo ${i + 1}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } });
  }
  content.push({ type: 'text', text: PROMPT(c.length, count, title) });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.CAROUSEL_MODEL || 'claude-sonnet-5-5', max_tokens: 600, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const body = await res.json();
  const text = (body.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const seen = new Set<number>();
  const picks: Candidate[] = [];
  for (const n of Array.isArray(json.picks) ? json.picks : []) {
    const i = Number(n) - 1;
    if (Number.isInteger(i) && i >= 0 && i < c.length && !seen.has(i) && picks.length < count) {
      seen.add(i);
      picks.push(c[i]);
    }
  }
  if (!picks.length) throw new Error('model returned no valid picks');
  return { picks, caption: typeof json.caption === 'string' ? json.caption.trim().slice(0, 2200) : '' };
}

/** One 1080x1350 JPEG. `crop` fills the frame; `pad` keeps the whole photo on a blurred copy of itself. */
export async function renderSlide(galleryId: string, filename: string, fit: 'crop' | 'pad'): Promise<Buffer> {
  await ensureLocalDerivative(galleryId, 'web', filename);
  const src = webPath(galleryId, filename);
  if (fit === 'crop') {
    return sharp(src).rotate().resize(SLIDE_W, SLIDE_H, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 90 }).toBuffer();
  }
  const bg = await sharp(src).rotate().resize(SLIDE_W, SLIDE_H, { fit: 'cover' }).blur(40).modulate({ brightness: 0.6 }).toBuffer();
  const fg = await sharp(src).rotate().resize(SLIDE_W, SLIDE_H, { fit: 'inside', withoutEnlargement: false }).toBuffer();
  return sharp(bg).composite([{ input: fg, gravity: 'centre' }]).jpeg({ quality: 90 }).toBuffer();
}

