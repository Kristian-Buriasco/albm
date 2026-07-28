import { themeToCss, DEFAULT_GALLERY_THEME, type GalleryTheme } from '@/lib/gallery-theme';
import { getFontPair } from '@/lib/gallery-fonts';

// DEFAULT_GALLERY_THEME.font is a preset in practice, but its type is the
// GalleryThemeFont union, so pull the fallback pair id out once here where
// it can be narrowed, rather than re-narrowing at every call site.
const DEFAULT_PAIR_ID =
  DEFAULT_GALLERY_THEME.font.kind === 'preset' ? DEFAULT_GALLERY_THEME.font.pairId : 'modern-minimal';

/**
 * Resolves a gallery theme's heading/body font-family strings — from the
 * curated preset registry, or straight off the theme for a custom pair —
 * and renders the scoped `[data-gallery-theme]` <style> block plus the
 * Google Fonts <link> tags for custom fonts. Shared by the client-gallery
 * (`GalleryClient`) and portfolio-gallery page renderers so both apply
 * theming identically.
 */
export default function GalleryThemeStyle({ theme }: { theme: GalleryTheme }) {
  const fontVars =
    theme.font.kind === 'custom'
      ? { heading: theme.font.headingFamily, body: theme.font.bodyFamily }
      : (() => {
          const pair = getFontPair(theme.font.pairId) ?? getFontPair(DEFAULT_PAIR_ID)!;
          return { heading: pair.heading.fontFamily, body: pair.body.fontFamily };
        })();
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeToCss(theme, fontVars) }} />
      {theme.font.kind === 'custom' && (
        <>
          <link rel="stylesheet" href={theme.font.headingUrl} />
          <link rel="stylesheet" href={theme.font.bodyUrl} />
        </>
      )}
    </>
  );
}
