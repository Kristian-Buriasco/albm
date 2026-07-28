'use client';

import { useState } from 'react';
import type { Gallery } from '@/db/schema';
import Select from '@/components/Select';
import SegmentedControl from '@/components/SegmentedControl';
import ToggleSwitch from '@/components/ToggleSwitch';
import GalleryThemeStyle from '@/components/GalleryThemeStyle';
import {
  DEFAULT_GALLERY_THEME,
  parseGalleryTheme,
  type GalleryTheme,
  type GalleryThemeColors,
} from '@/lib/gallery-theme';
import { GALLERY_FONT_PAIRS } from '@/lib/gallery-fonts';

// DEFAULT_GALLERY_THEME.font is a preset in practice, but its type is the
// GalleryThemeFont union — narrow the fallback pair id once here.
const DEFAULT_PAIR_ID =
  DEFAULT_GALLERY_THEME.font.kind === 'preset' ? DEFAULT_GALLERY_THEME.font.pairId : 'modern-minimal';

const labelClass = 'block text-xs';
const hintClass = 'mb-1 block text-neutral-500 dark:text-neutral-400';

function ColorRow({
  title,
  colors,
  onChange,
}: {
  title: string;
  colors: GalleryThemeColors;
  onChange: (colors: GalleryThemeColors) => void;
}) {
  const fields: { key: keyof GalleryThemeColors; label: string }[] = [
    { key: 'paper', label: 'Paper' },
    { key: 'ink', label: 'Ink' },
    { key: 'muted', label: 'Muted' },
    { key: 'line', label: 'Line' },
    { key: 'accent', label: 'Accent' },
  ];
  return (
    <div>
      <span className="mb-2 block text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
        {title}
      </span>
      <div className="flex flex-wrap gap-4">
        {fields.map(({ key, label }) => (
          <label key={key} className={labelClass}>
            <span className={hintClass}>{label}</span>
            <input
              type="color"
              value={colors[key]}
              onChange={(e) => onChange({ ...colors, [key]: e.target.value })}
              className="h-8 w-14 cursor-pointer border border-neutral-300 bg-transparent dark:border-neutral-700"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export default function GalleryDesignPanel({
  gallery,
  patchGallery,
}: {
  gallery: Gallery;
  patchGallery: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [theme, setTheme] = useState<GalleryTheme>(
    () => parseGalleryTheme(gallery.themeConfig) ?? DEFAULT_GALLERY_THEME,
  );
  const [customFonts, setCustomFonts] = useState(theme.font.kind === 'custom');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  async function save() {
    setSaving(true);
    const ok = await patchGallery({ themeConfig: theme });
    setSaving(false);
    if (ok) {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    }
  }

  async function resetToDefault() {
    setSaving(true);
    const ok = await patchGallery({ themeConfig: null });
    setSaving(false);
    if (ok) {
      setTheme(DEFAULT_GALLERY_THEME);
      setCustomFonts(DEFAULT_GALLERY_THEME.font.kind === 'custom');
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    }
  }

  return (
    <section className="grid gap-8 md:grid-cols-2">
      <div className="space-y-8">
        <div>
          <h2 className="text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
            Design
          </h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Give this gallery its own look — colors, fonts, cover, and grid layout. Leaves the
            rest of the site untouched.
            {saving && ' · saving…'}
            {savedFlash && !saving && ' · saved'}
          </p>
        </div>

        <div className="space-y-4">
          <ColorRow
            title="Light mode"
            colors={theme.colors.light}
            onChange={(light) => setTheme((th) => ({ ...th, colors: { ...th.colors, light } }))}
          />
          <ColorRow
            title="Dark mode"
            colors={theme.colors.dark}
            onChange={(dark) => setTheme((th) => ({ ...th, colors: { ...th.colors, dark } }))}
          />
        </div>

        <div className="space-y-3">
          <span className="block text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
            Fonts
          </span>
          <ToggleSwitch
            label="Use custom fonts"
            hint="Link your own Google Fonts stylesheets instead of a curated pair."
            checked={customFonts}
            onChange={(v) => {
              setCustomFonts(v);
              setTheme((th) => ({
                ...th,
                font: v
                  ? {
                      kind: 'custom',
                      headingUrl: th.font.kind === 'custom' ? th.font.headingUrl : '',
                      bodyUrl: th.font.kind === 'custom' ? th.font.bodyUrl : '',
                      headingFamily: th.font.kind === 'custom' ? th.font.headingFamily : '',
                      bodyFamily: th.font.kind === 'custom' ? th.font.bodyFamily : '',
                    }
                  : { kind: 'preset', pairId: DEFAULT_PAIR_ID },
              }));
            }}
          />
          {!customFonts && theme.font.kind === 'preset' && (
            <label className={labelClass}>
              <span className={hintClass}>Font pairing</span>
              <Select
                value={theme.font.pairId}
                onChange={(e) =>
                  setTheme((th) => ({ ...th, font: { kind: 'preset', pairId: e.target.value } }))
                }
                className="w-full border-b border-neutral-300 bg-transparent py-1.5 text-sm dark:border-neutral-700"
              >
                {GALLERY_FONT_PAIRS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.vibe}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {customFonts && theme.font.kind === 'custom' && (
            <div className="space-y-3">
              <label className={labelClass}>
                <span className={hintClass}>Heading font stylesheet URL (Google Fonts)</span>
                <input
                  type="url"
                  value={theme.font.headingUrl}
                  onChange={(e) =>
                    setTheme((th) =>
                      th.font.kind === 'custom'
                        ? { ...th, font: { ...th.font, headingUrl: e.target.value } }
                        : th,
                    )
                  }
                  placeholder="https://fonts.googleapis.com/css2?family=..."
                  className="w-full border-b border-neutral-300 bg-transparent py-1.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
                />
              </label>
              <label className={labelClass}>
                <span className={hintClass}>Heading font family name</span>
                <input
                  type="text"
                  value={theme.font.headingFamily}
                  onChange={(e) =>
                    setTheme((th) =>
                      th.font.kind === 'custom'
                        ? { ...th, font: { ...th.font, headingFamily: e.target.value } }
                        : th,
                    )
                  }
                  placeholder="e.g. Montserrat"
                  className="w-full border-b border-neutral-300 bg-transparent py-1.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
                />
              </label>
              <label className={labelClass}>
                <span className={hintClass}>Body font stylesheet URL (Google Fonts)</span>
                <input
                  type="url"
                  value={theme.font.bodyUrl}
                  onChange={(e) =>
                    setTheme((th) =>
                      th.font.kind === 'custom'
                        ? { ...th, font: { ...th.font, bodyUrl: e.target.value } }
                        : th,
                    )
                  }
                  placeholder="https://fonts.googleapis.com/css2?family=..."
                  className="w-full border-b border-neutral-300 bg-transparent py-1.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
                />
              </label>
              <label className={labelClass}>
                <span className={hintClass}>Body font family name</span>
                <input
                  type="text"
                  value={theme.font.bodyFamily}
                  onChange={(e) =>
                    setTheme((th) =>
                      th.font.kind === 'custom'
                        ? { ...th, font: { ...th.font, bodyFamily: e.target.value } }
                        : th,
                    )
                  }
                  placeholder="e.g. Source Sans 3"
                  className="w-full border-b border-neutral-300 bg-transparent py-1.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
                />
              </label>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <span className="block text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
            Cover
          </span>
          <label className={labelClass}>
            <span className={hintClass}>
              Overlay opacity ({theme.cover.overlayOpacity.toFixed(2)})
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={theme.cover.overlayOpacity}
              onChange={(e) =>
                setTheme((th) => ({
                  ...th,
                  cover: { ...th.cover, overlayOpacity: Number(e.target.value) },
                }))
              }
              className="w-full"
            />
          </label>
          <SegmentedControl
            label="Title placement"
            value={theme.cover.titlePlacement}
            onChange={(v) => setTheme((th) => ({ ...th, cover: { ...th.cover, titlePlacement: v } }))}
            options={[
              { value: 'center', label: 'Center' },
              { value: 'bottom-left', label: 'Bottom left' },
              { value: 'bottom-center', label: 'Bottom center' },
            ]}
          />
          <SegmentedControl
            label="Title size"
            value={theme.cover.titleSize}
            onChange={(v) => setTheme((th) => ({ ...th, cover: { ...th.cover, titleSize: v } }))}
            options={[
              { value: 'sm', label: 'Small' },
              { value: 'md', label: 'Medium' },
              { value: 'lg', label: 'Large' },
            ]}
          />
        </div>

        <div className="space-y-4">
          <span className="block text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
            Layout
          </span>
          <label className={labelClass}>
            <span className={hintClass}>Columns ({theme.layout.columns})</span>
            <input
              type="range"
              min={2}
              max={6}
              step={1}
              value={theme.layout.columns}
              onChange={(e) =>
                setTheme((th) => ({
                  ...th,
                  layout: { ...th.layout, columns: Number(e.target.value) },
                }))
              }
              className="w-full"
            />
          </label>
          <label className={labelClass}>
            <span className={hintClass}>Gap ({theme.layout.gap}px)</span>
            <input
              type="range"
              min={0}
              max={24}
              step={1}
              value={theme.layout.gap}
              onChange={(e) =>
                setTheme((th) => ({ ...th, layout: { ...th.layout, gap: Number(e.target.value) } }))
              }
              className="w-full"
            />
          </label>
          <label className={labelClass}>
            <span className={hintClass}>Corner radius ({theme.layout.radius}px)</span>
            <input
              type="range"
              min={0}
              max={16}
              step={1}
              value={theme.layout.radius}
              onChange={(e) =>
                setTheme((th) => ({
                  ...th,
                  layout: { ...th.layout, radius: Number(e.target.value) },
                }))
              }
              className="w-full"
            />
          </label>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="border border-neutral-900 px-4 py-2 text-xs uppercase disabled:opacity-40 dark:border-neutral-100"
          >
            Save design
          </button>
          <button
            type="button"
            onClick={resetToDefault}
            disabled={saving}
            className="border border-neutral-300 px-4 py-2 text-xs uppercase text-neutral-600 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300"
          >
            Reset to default
          </button>
        </div>
      </div>

      <div>
        <span className="mb-2 block text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
          Live preview
        </span>
        <div data-gallery-theme="" className="border border-line dark:border-line-dark">
          <GalleryThemeStyle theme={theme} />
          <div
            className="relative aspect-[16/9] w-full overflow-hidden bg-line dark:bg-line-dark"
            style={{ backgroundColor: 'var(--color-line)' }}
          >
            <div className="absolute inset-0 bg-black" style={{ opacity: 'var(--gallery-cover-overlay)' }} />
            <div
              className={`absolute inset-0 flex p-6 ${
                theme.cover.titlePlacement === 'center'
                  ? 'items-center justify-center text-center'
                  : theme.cover.titlePlacement === 'bottom-left'
                    ? 'items-end justify-start text-left'
                    : 'items-end justify-center text-center'
              }`}
            >
              <h2
                className={`font-semibold text-white ${
                  theme.cover.titleSize === 'sm'
                    ? 'text-xl'
                    : theme.cover.titleSize === 'lg'
                      ? 'text-3xl'
                      : 'text-2xl'
                }`}
                style={{ fontFamily: 'var(--gallery-font-heading)' }}
              >
                {gallery.title}
              </h2>
            </div>
          </div>
          <div
            className="p-4"
            style={{ backgroundColor: 'var(--color-paper)', color: 'var(--color-ink)' }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(var(--gallery-columns), minmax(0, 1fr))',
                gap: 'var(--gallery-gap)',
              }}
            >
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    aspectRatio: '1 / 1',
                    backgroundColor: 'var(--color-accent)',
                    opacity: 0.3 + i * 0.1,
                    borderRadius: 'var(--gallery-radius)',
                  }}
                />
              ))}
            </div>
            <p
              className="mt-3 text-sm"
              style={{ fontFamily: 'var(--gallery-font-body)', color: 'var(--color-muted)' }}
            >
              Body text sample in the muted tone.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
