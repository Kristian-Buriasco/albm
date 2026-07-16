/**
 * Best-effort JPEG GPS IFD stripper. Leaves other EXIF tags intact when possible.
 * If parsing fails, returns null so the caller can fall back to a full re-encode.
 */
export function stripGpsFromJpeg(buf: Buffer): Buffer | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  const parts: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  let changed = false;

  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1]!;
    // Soften / start of scan — copy rest
    if (marker === 0xda || marker === 0xd9) {
      parts.push(buf.subarray(i));
      return changed ? Buffer.concat(parts) : buf;
    }
    // Standalone markers
    if (marker >= 0xd0 && marker <= 0xd7) {
      parts.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0x01) {
      parts.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) break;
    const segment = buf.subarray(i, i + 2 + len);

    if (marker === 0xe1 && isExifSegment(segment)) {
      const cleaned = stripGpsFromExifSegment(segment);
      if (cleaned) {
        parts.push(cleaned);
        changed = changed || cleaned.length !== segment.length || !cleaned.equals(segment);
      } else {
        // Drop EXIF entirely if we can't surgically edit
        changed = true;
      }
    } else {
      parts.push(segment);
    }
    i += 2 + len;
  }

  if (i < buf.length) parts.push(buf.subarray(i));
  return changed ? Buffer.concat(parts) : buf;
}

function isExifSegment(seg: Buffer): boolean {
  // FF E1 ll lh E x i f \0 \0
  return (
    seg.length >= 10 &&
    seg[4] === 0x45 &&
    seg[5] === 0x78 &&
    seg[6] === 0x69 &&
    seg[7] === 0x66 &&
    seg[8] === 0x00 &&
    seg[9] === 0x00
  );
}

function stripGpsFromExifSegment(seg: Buffer): Buffer | null {
  try {
    const tiffStart = 10;
    if (seg.length < tiffStart + 8) return null;
    const le = seg[tiffStart] === 0x49 && seg[tiffStart + 1] === 0x49;
    const be = seg[tiffStart] === 0x4d && seg[tiffStart + 1] === 0x4d;
    if (!le && !be) return null;

    const read16 = (off: number) =>
      le ? seg.readUInt16LE(off) : seg.readUInt16BE(off);
    const read32 = (off: number) =>
      le ? seg.readUInt32LE(off) : seg.readUInt32BE(off);
    const write16 = (off: number, v: number) => {
      if (le) seg.writeUInt16LE(v, off);
      else seg.writeUInt16BE(v, off);
    };

    const ifd0 = tiffStart + read32(tiffStart + 4);
    if (ifd0 + 2 > seg.length) return null;
    const count = read16(ifd0);
    const entrySize = 12;
    const gpsTag = 0x8825;
    let gpsEntryOff = -1;
    for (let e = 0; e < count; e++) {
      const off = ifd0 + 2 + e * entrySize;
      if (off + 12 > seg.length) return null;
      if (read16(off) === gpsTag) {
        gpsEntryOff = off;
        break;
      }
    }
    if (gpsEntryOff < 0) return seg; // no GPS pointer

    // Zero out the GPS IFD pointer entry (tag + type + count + value)
    seg.fill(0, gpsEntryOff, gpsEntryOff + 12);
    // Reduce count and compact by moving later entries forward
    const newCount = count - 1;
    write16(ifd0, newCount);
    const nextStart = gpsEntryOff + entrySize;
    const entriesEnd = ifd0 + 2 + count * entrySize;
    if (nextStart < entriesEnd) {
      seg.copyWithin(gpsEntryOff, nextStart, entriesEnd + 4);
    }
    return seg;
  } catch {
    return null;
  }
}
