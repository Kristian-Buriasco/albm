import fs from 'node:fs';
import type { Metadata } from 'next';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { galleryIconPath } from './paths';

/** Version stamp for cache-busting: the master file's mtime, or null when the gallery has no icon. */
export function galleryIconVersion(galleryId: string): number | null {
  try {
    return Math.floor(fs.statSync(galleryIconPath(galleryId)).mtimeMs);
  } catch {
    return null;
  }
}

/**
 * `metadata.icons` for a gallery with its own icon, else undefined (the site-wide icons then apply).
 * Includes the 32px tab icon, a 192px one for Android, and the 180px Apple touch icon.
 */
export function galleryIconMetadata(galleryId: string): Metadata['icons'] | undefined {
  const v = galleryIconVersion(galleryId);
  if (v === null) return undefined;
  const url = (size: number) => `/gallery-icon/${galleryId}/${size}?v=${v}`;
  return {
    icon: [
      { url: url(32), sizes: '32x32', type: 'image/png' },
      { url: url(192), sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: url(180), sizes: '180x180', type: 'image/png' }],
  };
}

/** Icon-only metadata for the gallery's secondary pages (find / event / kiosk), looked up by slug. */
export function iconMetadataForSlug(slug: string): Metadata {
  const gallery = getDb()
    .select({ id: schema.galleries.id })
    .from(schema.galleries)
    .where(and(eq(schema.galleries.slug, slug), eq(schema.galleries.type, 'client')))
    .get();
  const icons = gallery ? galleryIconMetadata(gallery.id) : undefined;
  return icons ? { icons } : {};
}
