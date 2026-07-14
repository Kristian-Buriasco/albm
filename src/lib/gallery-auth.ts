import type { Gallery } from '@/db/schema';
import { hasGalleryAccess, isAdmin } from './session';
import { isGalleryExpired } from './downloads';

/**
 * Authorization for serving a gallery's images per §8:
 * - admin session bypasses everything
 * - portfolio: must be published (public)
 * - client: must be published AND (no password OR unlocked in gallery_access)
 * - expired galleries (autoExpire + past expiresAt) treated as unpublished for public
 */
export async function canViewGallery(
  gallery: Gallery,
  opts?: { preview?: boolean },
): Promise<boolean> {
  if (await isAdmin()) {
    if (opts?.preview) return true;
    return true;
  }
  if (!gallery.published) return false;
  if (isGalleryExpired(gallery)) return false;
  if (gallery.type === 'portfolio') return true;
  if (!gallery.passwordHash) return true;
  return hasGalleryAccess(gallery.id);
}

/** Public page visibility — admin preview bypasses published/expiry checks. */
export async function canPreviewGallery(): Promise<boolean> {
  return isAdmin();
}

export function galleryCommentsEnabled(gallery: Gallery): boolean {
  return gallery.commentsMode !== 'off';
}
