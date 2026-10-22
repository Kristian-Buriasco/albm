import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GALLERY_THEME_PRESETS, sanitizeGalleryTheme, themeToCss, sanitizeSiteTheme, siteThemeToCss } from '../../src/lib/gallery-theme.ts';

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

for (const preset of GALLERY_THEME_PRESETS) {
  test(`preset "${preset.id}" survives the server-side sanitizer unchanged`, () => {
    assert.deepEqual(sanitizeGalleryTheme(JSON.parse(JSON.stringify(preset.theme))), preset.theme);
  });

  for (const mode of ['light', 'dark']) {
    test(`preset "${preset.id}" ${mode}: text and accent are readable (WCAG AA)`, () => {
      const c = preset.theme.colors[mode];
      assert.ok(contrast(c.ink, c.paper) >= 7, `ink/paper ${contrast(c.ink, c.paper).toFixed(2)}`);
      assert.ok(contrast(c.muted, c.paper) >= 4.5, `muted/paper ${contrast(c.muted, c.paper).toFixed(2)}`);
      assert.ok(contrast(c.accent, c.paper) >= 4.5, `accent/paper ${contrast(c.accent, c.paper).toFixed(2)}`);
    });
  }
}

test('the KU Leuven preset uses the brand navy as its light-mode accent', () => {
  const ku = GALLERY_THEME_PRESETS.find((p) => p.id === 'ku-leuven-sport');
  assert.equal(ku.theme.colors.light.accent, '#004070');
  assert.equal(ku.theme.font.pairId, 'academic-serif');
});

test('dark mode sets the -dark tokens the app actually reads, and the wrapper paints the page', () => {
  const ku = GALLERY_THEME_PRESETS.find((p) => p.id === 'ku-leuven-sport');
  const css = themeToCss(ku.theme, { heading: 'serif', body: 'sans-serif' });
  const dark = css.split(':where(.dark)')[1];
  for (const token of ['paper', 'ink', 'muted', 'line', 'accent']) {
    assert.ok(dark.includes(`--color-${token}-dark: ${ku.theme.colors.dark[token]}`), `--color-${token}-dark`);
  }
  assert.match(css, /\[data-gallery-theme\] \{[\s\S]*background-color: var\(--color-paper\)/);
});

const siteColors = GALLERY_THEME_PRESETS[0].theme.colors;
test('site theme round-trips; bad hex / non-Google font URL rejected; mode defaults to auto', () => {
  const t = { colors: siteColors, font: null, mode: 'auto' };
  assert.deepEqual(sanitizeSiteTheme(JSON.parse(JSON.stringify(t))), t);
  assert.equal(sanitizeSiteTheme({ ...t, mode: 'bogus' }).mode, 'auto');
  const bad = { ...siteColors, light: { ...siteColors.light, ink: 'red' } };
  assert.equal(sanitizeSiteTheme({ ...t, colors: bad }), null);
  const font = { kind: 'custom', headingUrl: 'https://evil.example/x.css', bodyUrl: 'https://fonts.googleapis.com/css2?family=A', headingFamily: 'A', bodyFamily: 'A' };
  assert.equal(sanitizeSiteTheme({ ...t, font }), null);
  assert.equal(sanitizeSiteTheme({ ...t, font: { ...font, headingUrl: font.bodyUrl, headingFamily: 'A};x{' } }), null);
});

test('siteThemeToCss sets plain + -dark tokens and the font', () => {
  const css = siteThemeToCss({ colors: siteColors, font: null, mode: 'dark' }, { heading: 'H', body: 'B' });
  assert.match(css, /--color-paper: #f3f4f6/);
  assert.match(css, /--color-paper-dark: #0d0f12/);
  assert.match(css, /--font-sans: B/);
  assert.doesNotMatch(siteThemeToCss({ colors: siteColors, font: null, mode: 'auto' }, null), /--font-sans/);
});
