import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildXmpPacket, injectXmpRights, readXmpRights, setRawXmpPacket } from '../../src/lib/xmp.ts';

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

/** Minimal well-formedness check: every non-self-closing tag is matched and properly nested. */
function assertWellFormed(xml) {
  const stack = [];
  for (const [, close, name, selfClose] of xml.replace(/<\?[\s\S]*?\?>/g, '').matchAll(/<(\/?)([A-Za-z][\w:.-]*)[^>]*?(\/?)>/g)) {
    if (selfClose) continue;
    if (close) assert.equal(stack.pop(), name, `mismatched </${name}>`);
    else stack.push(name);
  }
  assert.deepEqual(stack, [], 'unclosed tags');
}
const packetOf = (buf) => buf.toString('utf8').match(/<\?xpacket begin[\s\S]*?<\?xpacket end="w"\?>/)[0];
const subjectItems = (p) => [...(p.match(/<dc:subject>[\s\S]*?<\/dc:subject>/)?.[0] ?? '').matchAll(/<rdf:li>([^<]*)<\/rdf:li>/g)].map((m) => m[1]);

test('keywords become an rdf:Bag and the description an x-default rdf:Alt, well-formed', () => {
  const p = buildXmpPacket({ copyright: '© 2026 A' }, { keywords: ['Finish', 'bib 12'], description: 'Runner crosses the line' });
  assertWellFormed(p);
  assert.match(p, /<dc:subject><rdf:Bag><rdf:li>Finish<\/rdf:li><rdf:li>bib 12<\/rdf:li><\/rdf:Bag><\/dc:subject>/);
  assert.match(p, /<dc:description><rdf:Alt><rdf:li xml:lang="x-default">Runner crosses the line<\/rdf:li><\/rdf:Alt><\/dc:description>/);
  assert.equal(p.match(/<rdf:Description /g).length, 1);
});

test('escapes markup in keywords and description', () => {
  const p = buildXmpPacket({ copyright: 'x' }, { keywords: ['<script>&"\''], description: `<b>"hi" & 'bye'</b>` });
  assertWellFormed(p);
  assert.ok(!p.includes('<script>'));
  assert.ok(p.includes('<rdf:li>&lt;script&gt;&amp;&quot;&apos;</rdf:li>'));
  assert.ok(p.includes('&lt;b&gt;&quot;hi&quot; &amp; &apos;bye&apos;&lt;/b&gt;'));
});

test('de-duplicates keywords case-insensitively, strips control characters, caps count and length', () => {
  const many = Array.from({ length: 80 }, (_, i) => `tag ${i}`);
  const p = buildXmpPacket(
    { copyright: 'x' },
    { keywords: ['Finish', 'finish', 'FINISH ', 'bib 12', 'Bib 12', 'a\u0007b', 'x'.repeat(100), ...many] },
  );
  assertWellFormed(p);
  const items = subjectItems(p);
  assert.equal(items.length, 50);
  assert.equal(new Set(items.map((i) => i.toLowerCase())).size, 50, 'no case-insensitive duplicates');
  assert.equal(items[0], 'Finish');
  assert.ok(items.includes('ab'), 'control character removed');
  assert.ok(items.some((i) => i.length === 64 && /^x+$/.test(i)), 'long keyword cut to 64');
});

test('description is capped at 300 characters and control characters are stripped', () => {
  const p = buildXmpPacket({ copyright: 'x' }, { description: `line1\nline2${'d'.repeat(400)}` });
  assertWellFormed(p);
  const desc = p.match(/<dc:description>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/)[1];
  assert.equal(desc.length, 300);
  assert.ok(desc.startsWith('line1line2d'));
});

test('empty keywords and blank description leave the JPEG byte-identical to the rights-only output', async () => {
  const src = await jpeg();
  const rights = { copyright: '© 2026 A', artist: 'One' };
  const base = injectXmpRights(src, rights);
  assert.deepEqual(injectXmpRights(src, rights, { keywords: [], description: '   ' }), base);
  assert.ok(!base.toString('utf8').includes('dc:subject'));
});

test('merges keywords and description with rights into one packet, replacing foreign dc:subject and keeping other properties', async () => {
  const foreign =
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmp:Rating="4">' +
    '<dc:subject><rdf:Bag><rdf:li>old</rdf:li></rdf:Bag></dc:subject></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  const out = injectXmpRights(setRawXmpPacket(await jpeg(), foreign), { copyright: '© 2026 K', artist: 'R' }, {
    keywords: ['Finish', 'bib 12'],
    description: 'Alt',
  });
  const p = packetOf(out);
  assertWellFormed(p);
  assert.equal(out.toString('latin1').match(/<x:xmpmeta/g).length, 1);
  assert.deepEqual(readXmpRights(out), { copyright: '© 2026 K', artists: ['R'] });
  assert.match(p, /xmp:Rating="4"/, 'foreign rating kept');
  assert.deepEqual(subjectItems(p), ['Finish', 'bib 12']);
  assert.equal(p.match(/<dc:subject>/g).length, 1);
  assert.equal(p.match(/<dc:description>/g).length, 1);
});

test('JPEG with keywords starts with FFD8, keeps one XMP segment, and re-injection does not duplicate', async () => {
  const src = await jpeg();
  const rights = { copyright: '© 2026 A', artist: 'One' };
  const extras = { keywords: ['Finish', 'bib 12'], description: 'Alt text' };
  const once = injectXmpRights(src, rights, extras);
  const twice = injectXmpRights(once, rights, extras);
  assert.equal(twice[0], 0xff);
  assert.equal(twice[1], 0xd8);
  const s = twice.toString('latin1');
  assert.equal(s.match(/ns\.adobe\.com\/xap\/1\.0\/\0/g).length, 1, 'exactly one XMP segment');
  assert.equal(s.match(/<x:xmpmeta/g).length, 1);
  assert.equal(s.match(/<dc:subject>/g).length, 1);
  assert.equal(s.match(/<dc:description>/g).length, 1);
  assert.equal((await sharp(twice).metadata()).format, 'jpeg');
  assert.ok((await sharp(twice).metadata()).xmp, 'sharp/libvips sees the XMP block');
  assert.equal(await pixels(twice), await pixels(src), 'decoded pixels are identical');
});
