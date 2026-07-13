import type { Gallery } from '@/db/schema';
import { hasGalleryAccess, isAdmin } from './session';

/**
 * Authorization for serving a gallery's images per §8:
 * - admin session bypasses everything
 * - portfolio: must be published (public)
 * - client: must be published AND (no password OR unlocked in gallery_access)
 */
export async function canViewGallery(gallery: Gallery): Promise<boolean> {
  if (await isAdmin()) return true;
  if (!gallery.published) return false;
  if (gallery.type === 'portfolio') return true;
  if (!gallery.passwordHash) return true;
  return hasGalleryAccess(gallery.id);
}
