'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The gallery's own browser-tab icon. Unlike the colours and fonts above, an upload or removal
 * here takes effect immediately (it is a file, not part of the saved theme).
 */
export default function GalleryIconPanel({ galleryId }: { galleryId: string }) {
  const [version, setVersion] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/admin/galleries/${galleryId}/icon`);
    if (res.ok) setVersion((await res.json()).version ?? null);
    setLoaded(true);
  }, [galleryId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function upload(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/admin/galleries/${galleryId}/icon`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setVersion(data.version ?? Date.now());
        setMessage({ kind: 'ok', text: 'Icon saved. Browsers cache tab icons, so it may take a while to appear on open tabs.' });
      } else {
        setMessage({ kind: 'error', text: data.error ?? 'Upload failed.' });
      }
    } catch {
      setMessage({ kind: 'error', text: 'Upload failed.' });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/icon`, { method: 'DELETE' });
      if (res.ok) {
        setVersion(null);
        setMessage({ kind: 'ok', text: 'Icon removed. This gallery uses the site icon again.' });
      } else {
        setMessage({ kind: 'error', text: 'Could not remove the icon.' });
      }
    } finally {
      setBusy(false);
    }
  }

  const src = (size: number) => `/gallery-icon/${galleryId}/${size}?v=${version}`;

  return (
    <div className="space-y-3" data-gallery-icon-panel>
      <span className="block text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
        Browser tab icon
      </span>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Shown in the browser tab and when the gallery is added to a phone&apos;s home screen — only for this
        gallery. Use a square image (PNG, JPEG, WebP or SVG, at least 192 px). Wider images are padded, not
        stretched. Uploading applies straight away; there is no need to press &ldquo;Save design&rdquo;.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        {version !== null ? (
          <div className="flex items-end gap-3" aria-label="Icon preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(32)} alt="Tab icon preview" width={32} height={32} className="border border-neutral-200 dark:border-neutral-700" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(180)} alt="Home-screen icon preview" width={60} height={60} className="rounded-xl border border-neutral-200 dark:border-neutral-700" />
          </div>
        ) : (
          loaded && <span className="text-xs text-neutral-500">Using the site icon.</span>
        )}

        <input
          ref={inputRef}
          id="gallery-icon-file"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          disabled={busy}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <label
          htmlFor="gallery-icon-file"
          className={`cursor-pointer border border-neutral-900 px-4 py-2 text-xs uppercase dark:border-neutral-100 ${busy ? 'opacity-40' : ''}`}
        >
          {version !== null ? 'Replace icon' : 'Upload icon'}
        </label>
        {version !== null && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="border border-neutral-300 px-4 py-2 text-xs uppercase text-neutral-600 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300"
          >
            Remove
          </button>
        )}
      </div>

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`text-xs ${message.kind === 'error' ? 'text-red-600 dark:text-red-400' : 'text-neutral-500 dark:text-neutral-400'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
