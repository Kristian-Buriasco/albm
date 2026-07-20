'use client';

import { useState } from 'react';
import ShareTools from '@/components/ShareTools';

/**
 * Live event wall / kiosk mode toggle (Settings tab, owner-only). Enabling
 * persists `kioskEnabled` + generates a `kioskToken` (server-side, kept for a
 * future deep-link/rotate flow) via PATCH /api/admin/galleries/[id]/kiosk.
 * The public link is still gated by the gallery's own password/PIN — the
 * token is not a bypass, just a stable identifier for the admin's own use.
 */
export default function KioskToggle({
  galleryId,
  slug,
  initialEnabled,
}: {
  galleryId: string;
  slug: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kioskUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/g/${slug}/kiosk`
      : `/g/${slug}/kiosk`;

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/kiosk`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error();
      setEnabled(next);
    } catch {
      setError('Could not update kiosk mode.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Live event wall (kiosk)</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Fullscreen auto-rotating slideshow of new uploads, for a TV or tablet at the venue.
            Uses the same password/PIN gate as the gallery.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={busy}
          onClick={() => toggle(!enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
            enabled ? 'bg-neutral-900 dark:bg-neutral-100' : 'bg-neutral-300 dark:bg-neutral-700'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform dark:bg-neutral-900 ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {enabled && (
        <div className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <p className="mb-1 text-[10px] tracking-wide text-neutral-500 uppercase">Kiosk link</p>
          <code className="mb-2 block max-w-[20rem] truncate rounded bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-900">
            {kioskUrl}
          </code>
          <ShareTools url={kioskUrl} />
        </div>
      )}
    </div>
  );
}
