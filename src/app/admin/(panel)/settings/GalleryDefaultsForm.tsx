'use client';

import { useState } from 'react';
import ToggleSwitch from '@/components/ToggleSwitch';
import type { GalleryDefaultsConfig, GalleryDefaultsStore } from '@/lib/gallery-defaults';

const emptyConfig = (): GalleryDefaultsConfig => ({});

export default function GalleryDefaultsForm({
  initialDefaults,
}: {
  initialDefaults: GalleryDefaultsStore;
}) {
  const [config, setConfig] = useState<GalleryDefaultsConfig>(
    initialDefaults.shared ?? emptyConfig(),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setBool(key: keyof GalleryDefaultsConfig, value: boolean) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ galleryDefaults: { shared: config } }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-sm font-medium tracking-widest uppercase">New-gallery defaults</h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Applied when creating a gallery unless you override individual fields. Existing galleries
          are unchanged.
        </p>
      </div>

      <div className="space-y-4">
        <ToggleSwitch
          label="Watermark enabled"
          checked={config.watermarkEnabled ?? false}
          onChange={(v) => setBool('watermarkEnabled', v)}
        />
        <label className="block text-xs">
          <span className="mb-1 block text-neutral-500">Watermark position</span>
          <select
            value={config.watermarkPosition ?? 'br'}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                watermarkPosition: e.target.value as GalleryDefaultsConfig['watermarkPosition'],
              }))
            }
            className="border-b border-neutral-300 bg-transparent py-1 text-sm dark:border-neutral-700"
          >
            <option value="br">Bottom right</option>
            <option value="bl">Bottom left</option>
            <option value="tr">Top right</option>
            <option value="tl">Top left</option>
            <option value="center">Center</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-neutral-500">Watermark opacity ({config.watermarkOpacity ?? 70})</span>
          <input
            type="range"
            min={0}
            max={100}
            value={config.watermarkOpacity ?? 70}
            onChange={(e) =>
              setConfig((c) => ({ ...c, watermarkOpacity: Number(e.target.value) }))
            }
            className="w-full"
          />
        </label>
        <ToggleSwitch
          label="Download enabled"
          checked={config.downloadEnabled ?? false}
          onChange={(v) => setBool('downloadEnabled', v)}
        />
        <ToggleSwitch
          label="Favorites ZIP download"
          checked={config.favoritesDownloadEnabled ?? false}
          onChange={(v) => setBool('favoritesDownloadEnabled', v)}
        />
        <ToggleSwitch
          label="Track downloads"
          checked={config.trackDownloads ?? true}
          onChange={(v) => setBool('trackDownloads', v)}
        />
        <ToggleSwitch
          label="Show EXIF"
          checked={config.showExif ?? false}
          onChange={(v) => setBool('showExif', v)}
        />
        <ToggleSwitch
          label="Show location"
          checked={config.showLocation ?? false}
          onChange={(v) => setBool('showLocation', v)}
        />
        <label className="block text-xs">
          <span className="mb-1 block text-neutral-500">Comments mode</span>
          <select
            value={config.commentsMode ?? 'off'}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                commentsMode: e.target.value as GalleryDefaultsConfig['commentsMode'],
              }))
            }
            className="border-b border-neutral-300 bg-transparent py-1 text-sm dark:border-neutral-700"
          >
            <option value="off">Off</option>
            <option value="post">After publish</option>
            <option value="pre">Before publish</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-neutral-500">Client info mode</span>
          <select
            value={config.clientInfoMode ?? 'off'}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                clientInfoMode: e.target.value as GalleryDefaultsConfig['clientInfoMode'],
              }))
            }
            className="border-b border-neutral-300 bg-transparent py-1 text-sm dark:border-neutral-700"
          >
            <option value="off">Off</option>
            <option value="optional">Optional</option>
            <option value="required">Required</option>
          </select>
        </label>
        <ToggleSwitch
          label="Limit selections"
          checked={config.limitSelections ?? false}
          onChange={(v) => setBool('limitSelections', v)}
        />
        {config.limitSelections && (
          <label className="block text-xs">
            <span className="mb-1 block text-neutral-500">Selection limit</span>
            <input
              type="number"
              min={1}
              value={config.selectionLimit ?? 10}
              onChange={(e) =>
                setConfig((c) => ({ ...c, selectionLimit: Number(e.target.value) || 10 }))
              }
              className="w-24 border-b border-neutral-300 bg-transparent py-1 dark:border-neutral-700"
            />
          </label>
        )}
        <ToggleSwitch
          label="Auto-expire"
          checked={config.autoExpire ?? false}
          onChange={(v) => setBool('autoExpire', v)}
        />
        {config.autoExpire && (
          <label className="block text-xs">
            <span className="mb-1 block text-neutral-500">Default expiry (days)</span>
            <input
              type="number"
              min={1}
              max={3650}
              value={config.defaultExpiryDays ?? 30}
              onChange={(e) =>
                setConfig((c) => ({ ...c, defaultExpiryDays: Number(e.target.value) || 30 }))
              }
              className="w-24 border-b border-neutral-300 bg-transparent py-1 dark:border-neutral-700"
            />
          </label>
        )}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="border border-neutral-900 px-6 py-2 text-xs tracking-widest uppercase transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-40 dark:border-neutral-100 dark:hover:bg-neutral-100 dark:hover:text-black"
      >
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save defaults'}
      </button>
    </section>
  );
}
