'use client';

import { useState } from 'react';
import SegmentedControl from '@/components/SegmentedControl';
import ToggleSwitch from '@/components/ToggleSwitch';
import RangeSlider from '@/components/RangeSlider';
import { ColorRow, FontFields } from '../galleries/[id]/GalleryDesignPanel';
import { DEFAULT_GALLERY_THEME, DEFAULT_NAV, type NavLinkConfig, type SiteTheme } from '@/lib/gallery-theme';

const DEFAULT: SiteTheme = {
  colors: DEFAULT_GALLERY_THEME.colors,
  font: null,
  mode: 'auto',
  headingWeight: null,
  uppercaseHeadings: false,
  baseSize: null,
  header: DEFAULT_NAV,
  customCss: '',
};

const inputClass =
  'w-full border-b border-neutral-300 bg-transparent py-1.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100';
const heading = 'block text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400';

function NavRow({ title, value, onChange }: { title: string; value: NavLinkConfig; onChange: (v: NavLinkConfig) => void }) {
  return (
    <div className="flex items-end gap-4">
      <label className="flex shrink-0 items-center gap-2 pb-1.5 text-sm">
        <input type="checkbox" checked={value.show} onChange={(e) => onChange({ ...value, show: e.target.checked })} />
        {title}
      </label>
      <input
        value={value.label}
        onChange={(e) => onChange({ ...value, label: e.target.value })}
        maxLength={40}
        placeholder={`Label (default: ${title})`}
        className={inputClass}
      />
    </div>
  );
}

export default function SiteThemeForm({ initialSiteTheme }: { initialSiteTheme: SiteTheme | null }) {
  const [theme, setTheme] = useState<SiteTheme>(initialSiteTheme ?? DEFAULT);
  const setNav = (k: 'work' | 'about' | 'contact') => (v: NavLinkConfig) =>
    setTheme((t) => ({ ...t, header: { ...t.header, [k]: v } }));
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState('');

  async function post(siteTheme: SiteTheme | null): Promise<boolean> {
    setSaving(true);
    setError('');
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteTheme }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setError('Could not save — check the colors and font URLs.');
      return false;
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
    return true;
  }

  const showLight = theme.mode !== 'dark';
  const showDark = theme.mode !== 'light';

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">Appearance</h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Colors and font for the whole public site. Galleries with their own design keep it. Save, then reload to see it.
          {saving && ' · saving…'}
          {savedFlash && !saving && ' · saved'}
        </p>
      </div>

      <SegmentedControl
        label="Light/dark mode"
        value={theme.mode}
        onChange={(mode) => setTheme((t) => ({ ...t, mode }))}
        options={[
          { value: 'auto', label: 'Visitor can switch' },
          { value: 'light', label: 'Always light' },
          { value: 'dark', label: 'Always dark' },
        ]}
      />

      <div className="space-y-4">
        {showLight && (
          <ColorRow
            title="Light mode"
            colors={theme.colors.light}
            onChange={(light) => setTheme((t) => ({ ...t, colors: { ...t.colors, light } }))}
          />
        )}
        {showDark && (
          <ColorRow
            title="Dark mode"
            colors={theme.colors.dark}
            onChange={(dark) => setTheme((t) => ({ ...t, colors: { ...t.colors, dark } }))}
          />
        )}
      </div>

      <FontFields allowNone font={theme.font} onChange={(font) => setTheme((t) => ({ ...t, font }))} />

      <div className="space-y-4">
        <span className={heading}>Typography</span>
        <label className="block text-xs">
          <span className="mb-1 block text-neutral-500 dark:text-neutral-400">
            Heading weight ({theme.headingWeight ?? 'default'})
          </span>
          <RangeSlider
            min={100}
            max={900}
            step={100}
            value={theme.headingWeight ?? 600}
            onChange={(v) => setTheme((t) => ({ ...t, headingWeight: v }))}
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-neutral-500 dark:text-neutral-400">
            Base text size ({theme.baseSize ?? 16}px)
          </span>
          <RangeSlider
            min={14}
            max={20}
            step={1}
            value={theme.baseSize ?? 16}
            onChange={(v) => setTheme((t) => ({ ...t, baseSize: v }))}
          />
        </label>
        <ToggleSwitch
          label="Uppercase headings"
          checked={theme.uppercaseHeadings}
          onChange={(v) => setTheme((t) => ({ ...t, uppercaseHeadings: v }))}
        />
        {(theme.headingWeight !== null || theme.baseSize !== null) && (
          <button
            type="button"
            onClick={() => setTheme((t) => ({ ...t, headingWeight: null, baseSize: null }))}
            className="text-xs text-neutral-500 underline dark:text-neutral-400"
          >
            Reset weight and size to default
          </button>
        )}
      </div>

      <div className="space-y-4">
        <span className={heading}>Header</span>
        <label className="block text-xs">
          <span className="mb-1 block text-neutral-500 dark:text-neutral-400">
            Logo image URL (https or /path — replaces the site name)
          </span>
          <input
            value={theme.header.logoUrl}
            onChange={(e) => setTheme((t) => ({ ...t, header: { ...t.header, logoUrl: e.target.value } }))}
            maxLength={500}
            placeholder="https://example.com/logo.svg"
            className={inputClass}
          />
        </label>
        <NavRow title="Work" value={theme.header.work} onChange={setNav('work')} />
        <NavRow title="About" value={theme.header.about} onChange={setNav('about')} />
        <NavRow title="Contact" value={theme.header.contact} onChange={setNav('contact')} />
      </div>

      <label className="block space-y-2">
        <span className={heading}>Custom CSS</span>
        <textarea
          value={theme.customCss}
          onChange={(e) => setTheme((t) => ({ ...t, customCss: e.target.value }))}
          rows={8}
          maxLength={10000}
          spellCheck={false}
          placeholder=".display { letter-spacing: 0.02em; }"
          className="w-full border border-neutral-300 bg-transparent p-3 font-mono text-xs leading-5 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
        />
        <span className="block text-xs text-neutral-500 dark:text-neutral-400">
          Applied to public pages only, after everything else. Colors are the variables{' '}
          <code>--color-paper</code>, <code>--color-ink</code>, <code>--color-accent</code> (+ <code>-dark</code>).
        </span>
      </label>

      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => post(theme)}
          disabled={saving}
          className="border border-neutral-900 px-4 py-2 text-xs uppercase disabled:opacity-40 dark:border-neutral-100"
        >
          Save appearance
        </button>
        <button
          type="button"
          onClick={async () => {
            if (await post(null)) setTheme(DEFAULT);
          }}
          disabled={saving}
          className="border border-neutral-300 px-4 py-2 text-xs uppercase text-neutral-600 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300"
        >
          Reset to default
        </button>
      </div>
    </section>
  );
}
