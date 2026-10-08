import type { Gallery } from '@/db/schema';
import { galleryRequiresAccess, galleryUsesPin } from './pin';
import { hasGalleryAccess, isAdmin } from './session';
import { isGalleryExpired } from './downloads';

export async function canViewGallery(gallery: Gallery): Promise<boolean> {
  if (await isAdmin()) return true;
  if (!gallery.published) return false;
  if (isGalleryExpired(gallery)) return false;
  if (gallery.type === 'portfolio') return true;
  if (!galleryRequiresAccess(gallery)) return true;
  return hasGalleryAccess(gallery.id);
}

export async function canPreviewGallery(): Promise<boolean> {
  return isAdmin();
}

export function galleryCommentsEnabled(gallery: Gallery): boolean {
  return gallery.commentsMode !== 'off';
}

export function needsAccessGate(gallery: Gallery): boolean {
  return galleryRequiresAccess(gallery);
}

export { galleryUsesPin };
