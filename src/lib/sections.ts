import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import type { Photo, Section } from '@/db/schema';
import { originalPath } from './paths';

export type SectionGroup = {
  id: string | null;
  title: string;
  sortOrder: number;
  photos: Photo[];
};

/** Ungrouped photos first, then named sections by sortOrder. */
export function groupPhotosBySection(
  galleryId: string,
  photos: Photo[],
): SectionGroup[] {
  const sections = getDb()
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.galleryId, galleryId))
    .orderBy(asc(schema.sections.sortOrder))
    .all();

  const bySection = new Map<string | null, Photo[]>();
  for (const p of photos) {
    const key = p.sectionId ?? null;
    const list = bySection.get(key) ?? [];
    list.push(p);
    bySection.set(key, list);
  }

  const groups: SectionGroup[] = [];
  const ungrouped = bySection.get(null) ?? [];
  if (ungrouped.length > 0 || sections.length > 0) {
    groups.push({
      id: null,
      title: 'Ungrouped',
      sortOrder: -1,
      photos: ungrouped.sort((a, b) => a.sortOrder - b.sortOrder),
    });
  }
  for (const s of sections) {
    groups.push({
      id: s.id,
      title: s.title,
      sortOrder: s.sortOrder,
      photos: (bySection.get(s.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    });
  }
  return groups.filter((g) => g.photos.length > 0 || g.id !== null);
}

export function flattenSectionGroups(groups: SectionGroup[]): Photo[] {
  return groups.flatMap((g) => g.photos);
}

export function sanitizeSectionFolder(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'section';
}

export type ZipEntry = { path: string; filePath: string };

export function zipEntriesForGallery(
  galleryId: string,
  photos: { galleryId: string; filename: string; sectionId: string | null }[],
  sections: Section[],
): ZipEntry[] {
  const sectionMap = new Map(sections.map((s) => [s.id, s.title]));
  const hasSections = sections.length > 0;

  return photos.map((photo) => {
    let name = photo.filename;
    if (hasSections && photo.sectionId) {
      const folder = sanitizeSectionFolder(sectionMap.get(photo.sectionId) ?? 'section');
      name = `${folder}/${photo.filename}`;
    }
    return {
      path: name,
      filePath: originalPath(photo.galleryId, photo.filename),
    };
  });
}
