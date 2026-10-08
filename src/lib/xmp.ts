/**
 * Lossless XMP rights metadata for JPEGs (no re-encode, no dependencies).
 *
 * Writes dc:rights (copyright) and dc:creator (artist) into the file's XMP
 * packet by inserting/merging an APP1 segment — the image data is never touched.
 * Any existing XMP is preserved except the properties we own (dc:rights,
 * dc:creator, xmpRights:Marked), which are replaced.
 */

const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\0';
const MAX_PAYLOAD = 65535 - 2 - Buffer.byteLength(XMP_HEADER); // APP1 length field is 16-bit

export type XmpRights = { copyright: string; artist?: string | null };

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** The rdf:Description block carrying our properties. */
function rightsDescription({ copyright, artist }: XmpRights): string {
  return (
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
    'xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmpRights:Marked="True">' +
    `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${esc(copyright)}</rdf:li></rdf:Alt></dc:rights>` +
    (artist?.trim() ? `<dc:creator><rdf:Seq><rdf:li>${esc(artist.trim())}</rdf:li></rdf:Seq></dc:creator>` : '') +
    '</rdf:Description>'
  );
}

export function buildXmpPacket(rights: XmpRights): string {
  return (
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    rightsDescription(rights) +
    '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>'
  );
}

/** Remove the properties we own from an existing packet and append our Description. */
function mergeIntoPacket(existing: string, rights: XmpRights): string | null {
  if (!existing.includes('</rdf:RDF>')) return null;
  const cleaned = existing
    .replace(/<dc:rights>[\s\S]*?<\/dc:rights>/g, '')
    .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/g, '')
    .replace(/\sxmpRights:Marked="[^"]*"/g, '');
  return cleaned.replace('</rdf:RDF>', rightsDescription(rights) + '</rdf:RDF>');
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
export function injectXmpRights(jpeg: Buffer, rights: XmpRights): Buffer {
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

  let packet: string | null = existing ? mergeIntoPacket(existing.text, rights) : null;
  if (packet === null || Buffer.byteLength(packet, 'utf8') > MAX_PAYLOAD) packet = buildXmpPacket(rights);
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
