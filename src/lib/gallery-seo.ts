import type { Metadata } from 'next';
import type { Gallery } from '@/db/schema';

export type EffectiveGallerySeo = {
  title: string;
  description: string | undefined;
  robots: Metadata['robots'];
};

/**
 * Effective SEO fields for a gallery's public page, applying per-gallery
 * overrides (`metaTitle` / `metaDescription` / `noindex`) over sensible
 * fallbacks. Owner wiring: call this from `generateMetadata` in the relevant
 * public page (e.g. `src/app/portfolio/[slug]/page.tsx`) and spread the
 * result into the returned `Metadata`:
 *
 *   const seo = effectiveGallerySeo(gallery);
 *   return { title: seo.title, description: seo.description, robots: seo.robots };
 */
export function effectiveGallerySeo(
  gallery: Pick<Gallery, 'title' | 'metaTitle' | 'metaDescription' | 'noindex'>,
): EffectiveGallerySeo {
  const title = gallery.metaTitle?.trim() || gallery.title;
  const description = gallery.metaDescription?.trim() || undefined;
  const robots: Metadata['robots'] = gallery.noindex
    ? { index: false, follow: false }
    : { index: true, follow: true };
  return { title, description, robots };
}
