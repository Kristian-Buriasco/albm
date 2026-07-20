import { schema } from '@/db';

type GalleryInsert = Partial<typeof schema.galleries.$inferInsert>;

const BOOL_KEYS = [
  'watermarkEnabled',
  'downloadEnabled',
  'favoritesDownloadEnabled',
  'selectionExportEnabled',
  'published',
  'featured',
  'showLikeCounts',
  'showExif',
  'showLocation',
  'autoExpire',
  'limitSelections',
  'trackDownloads',
  'socialPreview',
  'pinEnabled',
  'autoPublishOnUpload',
  'deliverRaw',
  'forensicWatermark',
  'downloadOfferWeb',
  'downloadOfferPrint',
  'downloadOfferOriginal',
  'keepExifOnDownload',
  'allowGpsInDownload',
  'bibSearch',
  'faceSearch',
  'eventPage',
] as const;

export function parseGalleryUpdates(body: Record<string, unknown>): GalleryInsert {
  const updates: GalleryInsert = {};

  if (typeof body.title === 'string' && body.title.trim()) {
    updates.title = body.title.trim();
  }
  if ('eventDate' in body) {
    updates.eventDate = typeof body.eventDate === 'number' ? body.eventDate : null;
  }
  if (
    body.clientInfoMode === 'off' ||
    body.clientInfoMode === 'optional' ||
    body.clientInfoMode === 'required'
  ) {
    updates.clientInfoMode = body.clientInfoMode;
  }
  if (
    body.commentsMode === 'off' ||
    body.commentsMode === 'post' ||
    body.commentsMode === 'pre'
  ) {
    updates.commentsMode = body.commentsMode;
  }
  if (
    body.watermarkPosition === 'br' ||
    body.watermarkPosition === 'bl' ||
    body.watermarkPosition === 'tr' ||
    body.watermarkPosition === 'tl' ||
    body.watermarkPosition === 'center'
  ) {
    updates.watermarkPosition = body.watermarkPosition;
  }
  for (const key of BOOL_KEYS) {
    if (typeof body[key] === 'boolean') updates[key] = body[key];
  }
  if (typeof body.watermarkOpacity === 'number') {
    updates.watermarkOpacity = Math.min(100, Math.max(0, Math.round(body.watermarkOpacity)));
  }
  if (typeof body.watermarkScale === 'number') {
    updates.watermarkScale = Math.min(100, Math.max(5, Math.round(body.watermarkScale)));
  }
  if ('expiresAt' in body) {
    updates.expiresAt = typeof body.expiresAt === 'number' ? body.expiresAt : null;
  }
  if ('selectionLimit' in body) {
    updates.selectionLimit =
      typeof body.selectionLimit === 'number' && body.selectionLimit > 0
        ? Math.round(body.selectionLimit)
        : null;
  }
  if ('locationName' in body) {
    updates.locationName =
      typeof body.locationName === 'string' && body.locationName.trim()
        ? body.locationName.trim().slice(0, 200)
        : null;
  }
  if ('locationLat' in body) {
    updates.locationLat =
      typeof body.locationLat === 'string' && body.locationLat.trim()
        ? body.locationLat.trim().slice(0, 32)
        : null;
  }
  if ('locationLng' in body) {
    updates.locationLng =
      typeof body.locationLng === 'string' && body.locationLng.trim()
        ? body.locationLng.trim().slice(0, 32)
        : null;
  }
  if ('coverPhotoId' in body) {
    updates.coverPhotoId =
      typeof body.coverPhotoId === 'string' ? body.coverPhotoId : null;
  }
  if ('previewPhotoId' in body) {
    updates.previewPhotoId =
      typeof body.previewPhotoId === 'string' ? body.previewPhotoId : null;
  }
  if (typeof body.sortOrder === 'number') updates.sortOrder = body.sortOrder;
  if (typeof body.coverFocusX === 'number') {
    updates.coverFocusX = Math.min(100, Math.max(0, Math.round(body.coverFocusX)));
  }
  if (typeof body.coverFocusY === 'number') {
    updates.coverFocusY = Math.min(100, Math.max(0, Math.round(body.coverFocusY)));
  }
  if ('folderId' in body) {
    updates.folderId =
      typeof body.folderId === 'string' && body.folderId ? body.folderId : null;
  }
  if ('metaTitle' in body) {
    updates.metaTitle =
      typeof body.metaTitle === 'string' && body.metaTitle.trim()
        ? body.metaTitle.trim().slice(0, 200)
        : null;
  }
  if ('metaDescription' in body) {
    updates.metaDescription =
      typeof body.metaDescription === 'string' && body.metaDescription.trim()
        ? body.metaDescription.trim().slice(0, 500)
        : null;
  }
  if (typeof body.noindex === 'boolean') {
    updates.noindex = body.noindex;
  }
  if ('storageQuotaBytes' in body) {
    const v = body.storageQuotaBytes;
    updates.storageQuotaBytes =
      typeof v === 'number' && Number.isFinite(v) && v > 0
        ? Math.round(v)
        : null;
  }
  return updates;
}

export function applyCreateFields(
  gallery: typeof schema.galleries.$inferInsert,
  body: Record<string, unknown>,
): void {
  const updates = parseGalleryUpdates(body);
  Object.assign(gallery, updates);
}
