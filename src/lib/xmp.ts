/**
 * Lossless XMP rights metadata for JPEGs (no re-encode, no dependencies).
 *
 * Writes dc:rights (copyright), dc:creator (artist), dc:subject (keywords) and
 * dc:description (alt text) into the file's XMP packet by inserting/merging an
 * APP1 segment — the image data is never touched. Any existing XMP is preserved
 * except the properties we own (dc:rights, dc:creator, xmpRights:Marked, and
 * dc:subject / dc:description when we supply them), which are replaced.
 */

const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\0';
const MAX_PAYLOAD = 65535 - 2 - Buffer.byteLength(XMP_HEADER); // APP1 length field is 16-bit
const KEYWORD_MAX_LEN = 64;
const KEYWORDS_MAX = 50;
const DESCRIPTION_MAX_LEN = 300;

export type XmpRights = { copyright: string; artist?: string | null };
export type XmpExtras = { keywords?: readonly string[]; description?: string | null };
type CleanExtras = { keywords: string[]; description: string };

function esc(s: string): string {
  return s
    .replace(/\p{Cc}/gu, '') // XML 1.0 forbids control characters
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function cleanText(s: string, max: number): string {
  return Array.from(s.replace(/\p{Cc}/gu, '').trim()).slice(0, max).join('').trim();
}

/** Trim, drop empties, de-duplicate case-insensitively (first spelling wins), cap the count. */
function normalizeExtras({ keywords = [], description }: XmpExtras): CleanExtras {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of keywords) {
    const k = cleanText(raw, KEYWORD_MAX_LEN);
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    kept.push(k);
  }
  return {
    keywords: kept.slice(0, KEYWORDS_MAX),
    description: cleanText(description ?? '', DESCRIPTION_MAX_LEN),
  };
}

/** The rdf:Description block carrying our properties. */
function ownDescription({ copyright, artist }: XmpRights, { keywords, description }: CleanExtras): string {
  return (
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
    'xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmpRights:Marked="True">' +
    `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${esc(copyright)}</rdf:li></rdf:Alt></dc:rights>` +
    (artist?.trim() ? `<dc:creator><rdf:Seq><rdf:li>${esc(artist.trim())}</rdf:li></rdf:Seq></dc:creator>` : '') +
    (keywords.length
      ? `<dc:subject><rdf:Bag>${keywords.map((k) => `<rdf:li>${esc(k)}</rdf:li>`).join('')}</rdf:Bag></dc:subject>`
      : '') +
    (description
      ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${esc(description)}</rdf:li></rdf:Alt></dc:description>`
      : '') +
    '</rdf:Description>'
  );
}

export function buildXmpPacket(rights: XmpRights, extras: XmpExtras = {}): string {
  return (
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    ownDescription(rights, normalizeExtras(extras)) +
    '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>'
  );
}

/** Remove the properties we own from an existing packet and append our Description. */
function mergeIntoPacket(existing: string, rights: XmpRights, extras: CleanExtras): string | null {
  if (!existing.includes('</rdf:RDF>')) return null;
  let cleaned = existing
    .replace(/<dc:rights>[\s\S]*?<\/dc:rights>/g, '')
    .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/g, '')
    .replace(/\sxmpRights:Marked="[^"]*"/g, '');
  if (extras.keywords.length) cleaned = cleaned.replace(/<dc:subject>[\s\S]*?<\/dc:subject>/g, '');
  if (extras.description) cleaned = cleaned.replace(/<dc:description>[\s\S]*?<\/dc:description>/g, '');
  return cleaned.replace('</rdf:RDF>', ownDescription(rights, extras) + '</rdf:RDF>');
}

function segment(payload: Buffer): Buffer {
  const header = Buffer.from(XMP_HEADER, 'latin1');
  const len = 2 + header.length + payload.length;
  const out = Buffer.alloc(2 + len);
  out[0] = 0xff;
  out[1] = 0xe1;
  out.writeUInt16BE(len, 2);
  header.copy(out, 4);
  payload.copy(out, 4 + header.length);
  return out;
}

function isXmpSegment(buf: Buffer, at: number, len: number): boolean {
  const h = Buffer.from(XMP_HEADER, 'latin1');
  return len >= 2 + h.length && buf.subarray(at + 4, at + 4 + h.length).equals(h);
}

/**
 * Insert (or merge into) the XMP packet of a JPEG. Returns the input unchanged
 * when it is not a JPEG, so callers can apply it unconditionally.
 */
export function injectXmpRights(jpeg: Buffer, rights: XmpRights, extras: XmpExtras = {}): Buffer {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;

  // Walk the leading APPn segments (JFIF, Exif, existing XMP, ...).
  let i = 2;
  let insertAt = 2;
  let existing: { start: number; end: number; text: string } | null = null;
  while (i + 4 <= jpeg.length && jpeg[i] === 0xff && (jpeg[i + 1] === 0xe0 || jpeg[i + 1] === 0xe1)) {
    const len = jpeg.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > jpeg.length) return jpeg; // malformed: leave untouched
    const end = i + 2 + len;
    if (jpeg[i + 1] === 0xe1 && isXmpSegment(jpeg, i, len)) {
      existing = { start: i, end, text: jpeg.subarray(i + 4 + XMP_HEADER.length, end).toString('utf8') };
    } else {
      insertAt = end; // keep our segment after JFIF/Exif
    }
    i = end;
  }

  const clean = normalizeExtras(extras);
  let packet: string | null = existing ? mergeIntoPacket(existing.text, rights, clean) : null;
  if (packet === null || Buffer.byteLength(packet, 'utf8') > MAX_PAYLOAD) packet = buildXmpPacket(rights, clean);
  if (Buffer.byteLength(packet, 'utf8') > MAX_PAYLOAD) return jpeg; // absurdly long text: don't corrupt the file

  const seg = segment(Buffer.from(packet, 'utf8'));
  if (existing) {
    return Buffer.concat([jpeg.subarray(0, existing.start), seg, jpeg.subarray(existing.end)]);
  }
  return Buffer.concat([jpeg.subarray(0, insertAt), seg, jpeg.subarray(insertAt)]);
}

/** Low-level helper used by tests: place an arbitrary XMP packet as the file's XMP segment. */
export function setRawXmpPacket(jpeg: Buffer, packet: string): Buffer {
  const seg = segment(Buffer.from(packet, 'utf8'));
  let i = 2;
  let insertAt = 2;
  while (i + 4 <= jpeg.length && jpeg[i] === 0xff && (jpeg[i + 1] === 0xe0 || jpeg[i + 1] === 0xe1)) {
    insertAt = i + 2 + jpeg.readUInt16BE(i + 2);
    i = insertAt;
  }
  return Buffer.concat([jpeg.subarray(0, insertAt), seg, jpeg.subarray(insertAt)]);
}

/** Read back dc:rights / dc:creator for verification. */
export function readXmpRights(jpeg: Buffer): { copyright: string | null; artists: string[] } {
  let i = 2;
  while (i + 4 <= jpeg.length && jpeg[i] === 0xff && (jpeg[i + 1] === 0xe0 || jpeg[i + 1] === 0xe1)) {
    const len = jpeg.readUInt16BE(i + 2);
    if (jpeg[i + 1] === 0xe1 && isXmpSegment(jpeg, i, len)) {
      const text = jpeg.subarray(i + 4 + XMP_HEADER.length, i + 2 + len).toString('utf8');
      const unesc = (s: string) =>
        s.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&');
      const rights = text.match(/<dc:rights>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/);
      const creator = text.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/);
      return {
        copyright: rights ? unesc(rights[1]) : null,
        artists: creator ? [...creator[1].matchAll(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/g)].map((m) => unesc(m[1])) : [],
      };
    }
    i += 2 + len;
  }
  return { copyright: null, artists: [] };
}
