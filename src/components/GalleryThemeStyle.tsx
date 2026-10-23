import { themeToCss, type GalleryTheme } from '@/lib/gallery-theme';
import { resolveFontVars } from '@/lib/gallery-fonts';

/**
 * Resolves a gallery theme's heading/body font-family strings — from the
 * curated preset registry, or straight off the theme for a custom pair —
 * and renders the scoped `[data-gallery-theme]` <style> block plus the
 * Google Fonts <link> tags for custom fonts. Shared by the client-gallery
 * (`GalleryClient`) and portfolio-gallery page renderers so both apply
 * theming identically.
 */
export default function GalleryThemeStyle({ theme }: { theme: GalleryTheme }) {
  const fontVars = resolveFontVars(theme.font);
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
