'use client';

import { useState } from 'react';
import SettingsCard from '@/components/SettingsCard';
import ToggleSwitch from '@/components/ToggleSwitch';

const OWNER = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Kristian Buriasco';

/**
 * Copyright & credits for one gallery.
 *  - "Copyright holder" is what visitors see ("© 2026 KU Leuven Sport").
 *  - "Embedded copyright" is what gets written into the XMP of downloaded JPEGs;
 *    blank means the site owner, so the photographer's own authorship travels
 *    with every file even when the page shows the client's name.
 */
export default function CopyrightFields({
  galleryId,
  initialHolder,
  initialShowCredits,
  initialXmpCopyright,
}: {
  galleryId: string;
  initialHolder: string | null;
  initialShowCredits: boolean;
  initialXmpCopyright: string | null;
}) {
  const [holder, setHolder] = useState(initialHolder ?? '');
  const [showCredits, setShowCredits] = useState(initialShowCredits);
  const [xmp, setXmp] = useState(initialXmpCopyright ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(false);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          copyrightHolder: holder.trim() || null,
          showCredits,
          xmpCopyright: xmp.trim() || null,
        }),
      });
      if (res.ok) setSaved(true);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const input =
    'mt-1 w-full rounded border border-neutral-300 bg-transparent p-2 text-sm outline-none dark:border-neutral-700';

  return (
    <SettingsCard
      title="Copyright & credits"
      description="The notice shown on this gallery, who is credited for the photos, and the copyright embedded in downloaded JPEGs."
    >
      <label className="block">
        <span className="block text-sm">Copyright holder shown on the gallery</span>
        <input
          id="copyright-holder"
          type="text"
          value={holder}
          onChange={(e) => setHolder(e.target.value)}
          maxLength={200}
          placeholder={`${OWNER} (default)`}
          className={input}
        />
        <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
          Appears as &ldquo;© year holder&rdquo; in the gallery footer and under each photo in the lightbox.
        </span>
      </label>
      <ToggleSwitch
        label="Show photographer credits"
        hint="Lists who shot the photos (you and collaborators who have a display name)."
        checked={showCredits}
        onChange={setShowCredits}
      />
      <label className="block">
        <span className="block text-sm">Copyright embedded in downloaded JPEGs</span>
        <input
          id="xmp-copyright"
          type="text"
          value={xmp}
          onChange={(e) => setXmp(e.target.value)}
          maxLength={200}
          placeholder={`${OWNER} (default)`}
          className={input}
        />
        <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
          Written into each downloaded JPEG&apos;s metadata (XMP). Leave blank to keep it in your own name,
          independent of the holder shown above.
        </span>
      </label>
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
        {error && <span className="text-xs text-red-600 dark:text-red-400">Could not save</span>}
      </div>
    </SettingsCard>
  );
}
