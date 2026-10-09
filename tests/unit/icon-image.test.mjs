import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ICON_SIZES, IconError, normalizeIcon, resizeIcon } from '../../src/lib/icon-image.ts';

const sharp = createRequire(import.meta.url)('sharp');
const png = (w, h, bg = { r: 200, g: 40, b: 40, alpha: 1 }) =>
  sharp({ create: { width: w, height: h, channels: 4, background: bg } }).png().toBuffer();
const jpg = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 90, b: 200 } } }).jpeg().toBuffer();
const dims = async (b) => { const m = await sharp(b).metadata(); return [m.width, m.height, m.format]; };

test('a square PNG becomes a 512x512 PNG', async () => {
  const out = await normalizeIcon(await png(300, 300));
  assert.deepEqual(await dims(out), [512, 512, 'png']);
});

test('a wide logo is padded to a square (not stretched or cropped) and keeps transparency', async () => {
  const out = await normalizeIcon(await png(800, 200));
  assert.deepEqual(await dims(out), [512, 512, 'png']);
  const { data, info } = await sharp(out).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const px = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  assert.equal(px(256, 2)[3], 0, 'padding above the logo is transparent');
  assert.equal(px(256, 256)[3], 255, 'the logo itself is opaque');
});

test('JPEG and WebP are accepted', async () => {
  assert.deepEqual(await dims(await normalizeIcon(await jpg(400, 400))), [512, 512, 'png']);
  const webp = await sharp(await png(64, 64)).webp().toBuffer();
  assert.deepEqual(await dims(await normalizeIcon(webp)), [512, 512, 'png']);
});

test('a harmless SVG is rasterised to PNG', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#004070"/></svg>');
  const out = await normalizeIcon(svg);
  assert.deepEqual(await dims(out), [512, 512, 'png']);
});

for (const [name, body] of [
  ['script', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
  ['foreignObject', '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>'],
  ['external image', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="file:///etc/passwd"/></svg>'],
  ['href to a URL', '<svg xmlns="http://www.w3.org/2000/svg"><image href="http://example.com/x.png"/></svg>'],
  ['entity', '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&x;</text></svg>'],
  ['css url()', '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(http://evil/x)"/></svg>'],
]) {
  test(`an SVG with ${name} is rejected`, async () => {
    await assert.rejects(() => normalizeIcon(Buffer.from(body)), (e) => e instanceof IconError && e.status === 415);
  });
}

test('rejects non-images, empty and oversized input', async () => {
  await assert.rejects(() => normalizeIcon(Buffer.from('not an image')), (e) => e instanceof IconError && e.status === 415);
  await assert.rejects(() => normalizeIcon(Buffer.alloc(0)), (e) => e instanceof IconError);
  await assert.rejects(() => normalizeIcon(Buffer.alloc(5 * 1024 * 1024 + 1)), (e) => e instanceof IconError && e.status === 413);
});

test('every supported size is generated exactly, from the 512 master', async () => {
  const master = await normalizeIcon(await png(300, 300));
  assert.deepEqual([...ICON_SIZES], [32, 180, 192, 512]);
  for (const size of ICON_SIZES) assert.deepEqual(await dims(await resizeIcon(master, size)), [size, size, 'png']);
});
