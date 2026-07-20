'use client';

import { useState } from 'react';
import SettingsCard from '@/components/SettingsCard';
import ToggleSwitch from '@/components/ToggleSwitch';

/**
 * SEO fields editor for a gallery's Settings tab. Owner wiring: drop this
 * into `GalleryAdmin.tsx`'s Settings tab, passing the gallery id and its
 * current `metaTitle` / `metaDescription` / `noindex` values. Persists via
 * the existing `PATCH /api/admin/galleries/[id]` route (already updated in
 * `@/lib/gallery-fields.ts` to accept these three fields).
 */
export default function SeoFields({
  galleryId,
  initialMetaTitle,
  initialMetaDescription,
  initialNoindex,
}: {
  galleryId: string;
  initialMetaTitle: string | null;
  initialMetaDescription: string | null;
  initialNoindex: boolean;
}) {
  const [metaTitle, setMetaTitle] = useState(initialMetaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(initialMetaDescription ?? '');
  const [noindex, setNoindex] = useState(initialNoindex);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metaTitle: metaTitle.trim() || null,
          metaDescription: metaDescription.trim() || null,
          noindex,
        }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="SEO"
      description="Overrides for the public listing (portfolio pages). Leave blank to use defaults."
    >
      <label className="block">
        <span className="block text-sm">Meta title</span>
        <input
          type="text"
          value={metaTitle}
          onChange={(e) => setMetaTitle(e.target.value)}
          maxLength={200}
          className="mt-1 w-full rounded border border-neutral-300 bg-transparent p-2 text-sm outline-none dark:border-neutral-700"
        />
      </label>
      <label className="block">
        <span className="block text-sm">Meta description</span>
        <textarea
          value={metaDescription}
          onChange={(e) => setMetaDescription(e.target.value)}
          maxLength={500}
          rows={3}
          className="mt-1 w-full rounded border border-neutral-300 bg-transparent p-2 text-sm outline-none dark:border-neutral-700"
        />
      </label>
      <ToggleSwitch
        label="No-index"
        hint="Hide this gallery's page from search engines"
        checked={noindex}
        onChange={setNoindex}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-neutral-900 px-4 py-2 text-xs font-medium tracking-wide text-white uppercase disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-xs text-neutral-500 dark:text-neutral-400">Saved</span>}
      </div>
    </SettingsCard>
  );
}
