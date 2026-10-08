import type { Gallery, Photo } from '@/db/schema';
import { formatExifLine, parseStoredExif } from './exif';
import { photoAltText } from './photo-media';
import type { LightboxPhoto } from '@/components/Lightbox';
import { creditNamesByUploader, photoCredit } from './credits';

export function mapPhotosForLightbox(gallery: Gallery, photos: Photo[]): LightboxPhoto[] {
  const names = gallery.showCredits ? creditNamesByUploader() : null;
  return photos.map((p) => ({
    id: p.id,
    filename: p.filename,
    width: p.width,
    height: p.height,
    placeholder: p.placeholder,
    updatedAt: p.updatedAt,
    alt: photoAltText(p, gallery.title),
    credit: names ? photoCredit(p, names) : null,
    exifLine:
      gallery.showExif && p.exif
        ? formatExifLine(parseStoredExif(p.exif) ?? {})
        : null,
  }));
}

export type SectionPayload = {
  id: string | null;
  title: string;
  photos: LightboxPhoto[];
};

export function buildSectionPayloads(
  gallery: Gallery,
  photos: Photo[],
  sections: { id: string; title: string; sortOrder: number }[],
): SectionPayload[] {
  const mapped = mapPhotosForLightbox(gallery, photos);
  const byId = new Map(mapped.map((p) => [p.id, p]));
  const ordered = photos
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => byId.get(p.id)!)
    .filter(Boolean);

  if (sections.length === 0) {
    return [{ id: null, title: '', photos: ordered }];
  }

  const groups: SectionPayload[] = [];
  const ungrouped = photos.filter((p) => !p.sectionId).sort((a, b) => a.sortOrder - b.sortOrder);
  if (ungrouped.length > 0) {
    groups.push({
      id: null,
      title: 'Ungrouped',
      photos: ungrouped.map((p) => byId.get(p.id)!),
    });
  }
  for (const s of sections.slice().sort((a, b) => a.sortOrder - b.sortOrder)) {
    const secPhotos = photos
      .filter((p) => p.sectionId === s.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => byId.get(p.id)!);
    if (secPhotos.length > 0) {
      groups.push({ id: s.id, title: s.title, photos: secPhotos });
    }
  }
  return groups;
}
