import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { injectXmpRights, readXmpRights, setRawXmpPacket } from '../../src/lib/xmp.ts';

const sharp = createRequire(import.meta.url)('sharp');
const jpeg = () =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 90, g: 120, b: 200 } } }).jpeg({ quality: 80 }).toBuffer();
const pixels = async (b) => (await sharp(b).raw().toBuffer()).toString('base64');

test('writes copyright + artist without touching a single pixel', async () => {
  const src = await jpeg();
  const out = injectXmpRights(src, { copyright: '© 2026 Kristian Buriasco', artist: 'Ruben V.' });
  assert.deepEqual(readXmpRights(out), { copyright: '© 2026 Kristian Buriasco', artists: ['Ruben V.'] });
  assert.equal(await pixels(out), await pixels(src), 'decoded pixels are identical');
  assert.ok(out.length > src.length);
  assert.equal((await sharp(out).metadata()).format, 'jpeg');
  assert.ok((await sharp(out).metadata()).xmp, 'sharp/libvips sees the XMP block');
});

test('escapes XML-special characters in names', async () => {
  const out = injectXmpRights(await jpeg(), { copyright: '© <KU> & "Leuven" Sport', artist: "O'Neil & Sons" });
  assert.deepEqual(readXmpRights(out), { copyright: '© <KU> & "Leuven" Sport', artists: ["O'Neil & Sons"] });
});

test('re-applying replaces our fields instead of duplicating them', async () => {
  const once = injectXmpRights(await jpeg(), { copyright: '© 2026 A', artist: 'One' });
  const twice = injectXmpRights(once, { copyright: '© 2026 B', artist: 'Two' });
  assert.deepEqual(readXmpRights(twice), { copyright: '© 2026 B', artists: ['Two'] });
  assert.equal((twice.toString('latin1').match(/<dc:rights>/g) ?? []).length, 1);
  assert.equal((twice.toString('latin1').match(/ns\.adobe\.com\/xap\/1\.0\/\0/g) ?? []).length, 1, 'exactly one XMP segment');
});

test('keeps unrelated properties from an existing XMP packet and overrides a foreign copyright', async () => {
  const foreign =
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmp:Rating="4">' +
    '<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">© Someone Else</rdf:li></rdf:Alt></dc:rights></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  const withForeign = setRawXmpPacket(await jpeg(), foreign);
  const out = injectXmpRights(withForeign, { copyright: '© 2026 Kristian Buriasco' });
  assert.equal(readXmpRights(out).copyright, '© 2026 Kristian Buriasco');
  assert.match(out.toString('utf8'), /xmp:Rating="4"/, 'rating preserved');
  assert.ok(!out.toString('utf8').includes('Someone Else'));
});

test('omits dc:creator when there is no artist name', async () => {
  const out = injectXmpRights(await jpeg(), { copyright: '© 2026 X', artist: null });
  assert.deepEqual(readXmpRights(out), { copyright: '© 2026 X', artists: [] });
});

test('non-JPEG and malformed input is returned untouched', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
  assert.equal(injectXmpRights(png, { copyright: 'x' }), png);
  const bad = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3]); // APP1 claims 65535 bytes
  assert.equal(injectXmpRights(bad, { copyright: 'x' }), bad);
});

test('survives a full sharp round-trip decode of the result', async () => {
  const out = injectXmpRights(await jpeg(), { copyright: '© 2026 Y', artist: 'Z' });
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 64);
  assert.equal(meta.height, 48);
});
