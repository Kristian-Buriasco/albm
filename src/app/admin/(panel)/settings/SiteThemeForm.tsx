'use client';

import { useState } from 'react';
import SegmentedControl from '@/components/SegmentedControl';
import { ColorRow, FontFields } from '../galleries/[id]/GalleryDesignPanel';
import { DEFAULT_GALLERY_THEME, type SiteTheme } from '@/lib/gallery-theme';

const DEFAULT: SiteTheme = { colors: DEFAULT_GALLERY_THEME.colors, font: null, mode: 'auto' };

export default function SiteThemeForm({ initialSiteTheme }: { initialSiteTheme: SiteTheme | null }) {
  const [theme, setTheme] = useState<SiteTheme>(initialSiteTheme ?? DEFAULT);
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
