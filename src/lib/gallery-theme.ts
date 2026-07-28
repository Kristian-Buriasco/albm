export type GalleryThemeColors = {
  paper: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
};

export type GalleryThemeFont =
  | { kind: 'preset'; pairId: string }
  | { kind: 'custom'; headingUrl: string; bodyUrl: string; headingFamily: string; bodyFamily: string };

export type GalleryTheme = {
  colors: {
    light: GalleryThemeColors;
    dark: GalleryThemeColors;
  };
  font: GalleryThemeFont;
  cover: {
    overlayOpacity: number; // 0-1
    titlePlacement: 'center' | 'bottom-left' | 'bottom-center';
    titleSize: 'sm' | 'md' | 'lg';
    height: number; // 20-80 (vh)
  };
  layout: {
    columns: number; // 2-6
    gap: number; // 0-24 (px)
    radius: number; // 0-16 (px)
  };
};

/** Site default look — used to seed the admin editor's starting point. */
export const DEFAULT_GALLERY_THEME: GalleryTheme = {
  colors: {
    light: { paper: '#f3f4f6', ink: '#14171b', muted: '#676e76', line: '#e4e6e9', accent: '#2f6e8f' },
    dark: { paper: '#0d0f12', ink: '#e9ebee', muted: '#868d96', line: '#24282d', accent: '#6fb4ce' },
  },
  font: { kind: 'preset', pairId: 'modern-minimal' },
  cover: { overlayOpacity: 0.35, titlePlacement: 'bottom-left', titleSize: 'md', height: 45 },
  layout: { columns: 4, gap: 8, radius: 0 },
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v);
}

function sanitizeColors(v: unknown): GalleryThemeColors | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isHexColor(o.paper) || !isHexColor(o.ink) || !isHexColor(o.muted) || !isHexColor(o.line) || !isHexColor(o.accent)) {
    return null;
  }
  return { paper: o.paper, ink: o.ink, muted: o.muted, line: o.line, accent: o.accent };
}

function sanitizeFont(v: unknown): GalleryThemeFont | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.kind === 'preset' && typeof o.pairId === 'string' && o.pairId) {
    return { kind: 'preset', pairId: o.pairId };
  }
  if (
    o.kind === 'custom' &&
    typeof o.headingUrl === 'string' &&
    typeof o.bodyUrl === 'string' &&
    typeof o.headingFamily === 'string' &&
    o.headingFamily.trim() &&
    typeof o.bodyFamily === 'string' &&
    o.bodyFamily.trim()
  ) {
    // Only ever allow Google Fonts stylesheet URLs — this is the one place
    // the app makes a deliberate third-party request, so keep it pinned to
    // exactly that domain rather than an arbitrary attacker-supplied URL.
    const isGoogleFontsUrl = (u: string) => /^https:\/\/fonts\.googleapis\.com\//.test(u);
    if (isGoogleFontsUrl(o.headingUrl) && isGoogleFontsUrl(o.bodyUrl)) {
      return {
        kind: 'custom',
        headingUrl: o.headingUrl,
        bodyUrl: o.bodyUrl,
        headingFamily: o.headingFamily.trim().slice(0, 100),
        bodyFamily: o.bodyFamily.trim().slice(0, 100),
      };
    }
  }
  return null;
}

/**
 * Validates + clamps a parsed (already-a-JS-object) theme value — used by
 * the admin API route on the raw request body. Returns null for anything
 * malformed; the API treats null as a valid "clear the theme" request, same
 * as the DB layer treats it as "use site default."
 */
export function sanitizeGalleryTheme(parsed: unknown): GalleryTheme | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;

  const colorsObj = o.colors as Record<string, unknown> | undefined;
  const light = sanitizeColors(colorsObj?.light);
  const dark = sanitizeColors(colorsObj?.dark);
  const font = sanitizeFont(o.font);
  if (!light || !dark || !font) return null;

  const coverObj = (o.cover as Record<string, unknown>) ?? {};
  const layoutObj = (o.layout as Record<string, unknown>) ?? {};

  const titlePlacement =
    coverObj.titlePlacement === 'center' ||
    coverObj.titlePlacement === 'bottom-left' ||
    coverObj.titlePlacement === 'bottom-center'
      ? coverObj.titlePlacement
      : DEFAULT_GALLERY_THEME.cover.titlePlacement;
  const titleSize =
    coverObj.titleSize === 'sm' || coverObj.titleSize === 'md' || coverObj.titleSize === 'lg'
      ? coverObj.titleSize
      : DEFAULT_GALLERY_THEME.cover.titleSize;

  return {
    colors: { light, dark },
    font,
    cover: {
      overlayOpacity: clamp(Number(coverObj.overlayOpacity ?? DEFAULT_GALLERY_THEME.cover.overlayOpacity), 0, 1),
      titlePlacement,
      titleSize,
      height: clamp(Math.round(Number(coverObj.height ?? DEFAULT_GALLERY_THEME.cover.height)), 20, 80),
    },
    layout: {
      columns: clamp(Math.round(Number(layoutObj.columns ?? DEFAULT_GALLERY_THEME.layout.columns)), 2, 6),
      gap: clamp(Math.round(Number(layoutObj.gap ?? DEFAULT_GALLERY_THEME.layout.gap)), 0, 24),
      radius: clamp(Math.round(Number(layoutObj.radius ?? DEFAULT_GALLERY_THEME.layout.radius)), 0, 16),
    },
  };
}

/**
 * Parses and validates a themeConfig JSON string from the DB. Returns null
 * for anything null/empty/malformed — callers treat null as "use site
 * default," so a corrupt value degrades to the default look rather than
 * erroring.
 */
export function parseGalleryTheme(raw: string | null): GalleryTheme | null {
  if (!raw) return null;
  try {
    return sanitizeGalleryTheme(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function stringifyGalleryTheme(theme: GalleryTheme | null): string | null {
  return theme ? JSON.stringify(theme) : null;
}

/** Inline <style> CSS text for a themed gallery, scoped to [data-gallery-theme]. */
export function themeToCss(theme: GalleryTheme, fontVars: { heading: string; body: string }): string {
  const block = (c: GalleryThemeColors, extra: string) => `
  --color-paper: ${c.paper}; --color-ink: ${c.ink}; --color-muted: ${c.muted};
  --color-line: ${c.line}; --color-accent: ${c.accent};
  ${extra}`;
  const shared = `
  --gallery-columns: ${theme.layout.columns};
  --gallery-gap: ${theme.layout.gap}px;
  --gallery-radius: ${theme.layout.radius}px;
  --gallery-cover-overlay: ${theme.cover.overlayOpacity};
  --gallery-cover-height: ${theme.cover.height}vh;
  --gallery-font-heading: ${fontVars.heading};
  --gallery-font-body: ${fontVars.body};`;
  // Dark mode here mirrors the app-wide convention: a `.dark` class is added
  // to <html> (see src/app/layout.tsx's themeScript + globals.css's
  // `@custom-variant dark (&:where(.dark, .dark *))`), not to this element
  // itself — so the override must target [data-gallery-theme] as a
  // descendant of .dark, not an element carrying both selectors at once.
  return `[data-gallery-theme] {${block(theme.colors.light, shared)}
}
:where(.dark) [data-gallery-theme] {${block(theme.colors.dark, '')}
}`;
}
