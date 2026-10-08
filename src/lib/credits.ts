import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import type { Gallery, Photo } from '@/db/schema';
import { SITE_NAME } from '@/lib/env';

/** The site owner's name — the default copyright holder and the credit for photos the owner uploaded. */
export function ownerName(): string {
  return SITE_NAME;
}

/** Public copyright holder for a gallery: its own setting, else the site owner. */
export function copyrightHolder(gallery: Pick<Gallery, 'copyrightHolder'>): string {
  return gallery.copyrightHolder?.trim() || ownerName();
}

/** Year shown in the notice: the event's year when set, otherwise when the gallery was created. */
export function copyrightYear(gallery: Pick<Gallery, 'eventDate' | 'createdAt'>): number {
  const ts = gallery.eventDate ?? gallery.createdAt;
  return new Date(ts).getUTCFullYear();
}

export function copyrightLine(gallery: Pick<Gallery, 'copyrightHolder' | 'eventDate' | 'createdAt'>): string {
  return `© ${copyrightYear(gallery)} ${copyrightHolder(gallery)}`;
}

/**
 * Copyright written into downloaded JPEGs' XMP. Default = the site owner, regardless of the
 * holder shown on the page, so the photographer's own authorship always travels with the file.
 * An override that already starts with a copyright sign / "(c)" is used verbatim.
 */
export function embeddedCopyright(
  gallery: Pick<Gallery, 'xmpCopyright' | 'eventDate' | 'createdAt'>,
): string {
  const custom = gallery.xmpCopyright?.trim();
  if (custom) return /^(©|\(c\))/i.test(custom) ? custom : `© ${copyrightYear(gallery)} ${custom}`;
  return `© ${copyrightYear(gallery)} ${ownerName()}`;
}

/**
 * Who shot each photo, keyed by `photos.uploadedBy` (null = the owner). A collaborator
 * with no display name maps to null: we omit the credit rather than mis-attribute it.
 */
export function creditNamesByUploader(): Map<string | null, string | null> {
  const map = new Map<string | null, string | null>([[null, ownerName()]]);
  for (const c of getDb().select().from(schema.collaborators).all()) {
    map.set(c.id, c.name?.trim() || null);
  }
  return map;
}

export function photoCredit(
  photo: Pick<Photo, 'uploadedBy'>,
  names: Map<string | null, string | null>,
): string | null {
  return names.get(photo.uploadedBy ?? null) ?? null;
}

/** Distinct photographer names for the gallery footer, most photos first (ties: owner first). */
export function galleryCredits(photos: Pick<Photo, 'uploadedBy'>[]): string[] {
  const names = creditNamesByUploader();
  const counts = new Map<string, number>();
  for (const p of photos) {
    const n = photoCredit(p, names);
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const owner = ownerName();
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] === owner ? -1 : b[0] === owner ? 1 : a[0].localeCompare(b[0])))
    .map(([n]) => n);
}

/** Credit names for one gallery's photos (used by the admin to warn about unnamed collaborators). */
export function unnamedCollaboratorIds(galleryId: string): string[] {
  const rows = getDb()
    .select({ id: schema.collaborators.id, name: schema.collaborators.name })
    .from(schema.galleryGrants)
    .innerJoin(schema.collaborators, eq(schema.galleryGrants.collaboratorId, schema.collaborators.id))
    .where(eq(schema.galleryGrants.galleryId, galleryId))
    .all();
  return rows.filter((r) => !r.name?.trim()).map((r) => r.id);
}
