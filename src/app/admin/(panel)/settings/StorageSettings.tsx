'use client';

import { useState } from 'react';
import type { StorageView } from '@/lib/storage-settings';

type Gallery = { id: string; title: string };

const field = 'w-full border-b border-neutral-300 bg-transparent py-1 dark:border-neutral-700';

export default function StorageSettings({ initial, galleries }: { initial: StorageView; galleries: Gallery[] }) {
  const [v, setV] = useState(initial);
  const [secret, setSecret] = useState('');
  const [allGalleries, setAllGalleries] = useState(initial.galleries.length === 0);
  const [busy, setBusy] = useState<'save' | 'test' | 'reset' | null>(null);
  const noneTicked = !allGalleries && v.galleries.length === 0;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = <K extends keyof StorageView>(k: K, val: StorageView[K]) => setV((p) => ({ ...p, [k]: val }));

  function body() {
    return JSON.stringify({
      enabled: v.enabled,
      endpoint: v.endpoint,
      bucket: v.bucket,
      region: v.region,
      accessKeyId: v.accessKeyId,
      secretAccessKey: secret,
      prefix: v.prefix,
      keepLocal: v.keepLocal,
      originals: v.originals,
      galleries: allGalleries ? [] : v.galleries,
    });
  }

  async function call(kind: 'save' | 'test' | 'reset') {
    if (kind === 'save' && initial.enabled) {
      const moved = !v.enabled || v.endpoint.trim() !== initial.endpoint || v.bucket.trim() !== initial.bucket || v.prefix.trim() !== initial.prefix;
      if (moved && !confirm('This stops reading from the current bucket. Photos that exist only there (no local copy) will not load until you move them or switch back. Continue?')) return;
    }
    if (kind === 'reset' && !confirm('Forget the saved settings and go back to the server environment variables?')) return;
    setBusy(kind);
    setMsg(null);
    try {
      const res = await fetch(kind === 'test' ? '/api/admin/storage/test' : '/api/admin/storage/settings', {
        method: kind === 'save' ? 'PUT' : kind === 'reset' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: kind === 'reset' ? undefined : body(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) setMsg({ ok: false, text: 'Your session expired. Log in again.' });
      else if (kind === 'test') setMsg(data.ok ? { ok: true, text: 'Connection works: wrote, read and deleted a test file.' } : { ok: false, text: data.error ?? 'Test failed' });
      else if (!res.ok) setMsg({ ok: false, text: data.error ?? 'Could not save' });
      else {
        setV(data);
        setAllGalleries(data.galleries.length === 0);
        setSecret('');
        setMsg({ ok: true, text: kind === 'reset' ? 'Back to environment settings.' : 'Saved. Applies immediately.' });
      }
    } catch {
      setMsg({ ok: false, text: 'Network error' });
    } finally {
      setBusy(null);
    }
  }

  const toggleGallery = (id: string) =>
    set('galleries', v.galleries.includes(id) ? v.galleries.filter((x) => x !== id) : [...v.galleries, id]);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-sm font-medium tracking-widest uppercase">Object storage</h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Keep photos in an S3-compatible bucket (Cloudflare R2, Backblaze B2, MinIO, AWS) instead of only on this server&apos;s disk.
          {v.source === 'env' && ' Currently configured by server environment variables; saving here replaces them.'}
          {v.source === 'ui' && ' Saved in Albm; these settings replace the environment variables.'}
        </p>
      </div>

      {v.secretUnreadable && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          The saved secret key can no longer be read (the server&apos;s SESSION_SECRET changed), so the server environment settings are in use. Enter the secret again and save.
        </p>
      )}
      <label className="flex items-center gap-2 py-1 text-xs">
        <input type="checkbox" checked={v.enabled} onChange={(e) => set('enabled', e.target.checked)} />
        Use object storage
      </label>
      <p className="-mt-4 text-xs text-neutral-500">Unticking this turns the bucket off even if the server environment has it on.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs sm:col-span-2">
          <span className="mb-1 block text-neutral-500">Endpoint</span>
          <input className={field} value={v.endpoint} onChange={(e) => set('endpoint', e.target.value)} placeholder="https://<account-id>.r2.cloudflarestorage.com" />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-neutral-500">Bucket</span>
          <input className={field} value={v.bucket} onChange={(e) => set('bucket', e.target.value)} placeholder="albm" />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-neutral-500">Region</span>
          <input className={field} value={v.region} onChange={(e) => set('region', e.target.value)} placeholder="auto" />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-neutral-500">Access key ID</span>
          <input className={field} value={v.accessKeyId} onChange={(e) => set('accessKeyId', e.target.value)} autoComplete="off" />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-neutral-500">Secret access key</span>
          <input
            className={field}
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="new-password"
            placeholder={v.hasSecret ? 'Saved (leave blank to keep)' : v.secretUnreadable ? 'Saved key unreadable, enter again' : ''}
          />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="mb-1 block text-neutral-500">Key prefix (optional)</span>
          <input className={field} value={v.prefix} onChange={(e) => set('prefix', e.target.value)} placeholder="leave empty unless the bucket is shared" />
        </label>
      </div>

      <div className="space-y-2 text-xs">
        <label className="flex items-start gap-2 py-1">
          <input className="mt-0.5" type="checkbox" checked={v.originals} onChange={(e) => set('originals', e.target.checked)} />
          <span>Also store original files in the bucket (a safe copy; downloads fall back to it if the local file is missing)</span>
        </label>
        <label className="flex items-start gap-2 py-1">
          <input className="mt-0.5" type="checkbox" checked={v.keepLocal} onChange={(e) => set('keepLocal', e.target.checked)} />
          <span>Keep local copies of thumbnails and web sizes (faster; uncheck to save server disk)</span>
        </label>
      </div>

      <fieldset className="space-y-2 text-xs">
        <legend className="mb-1 text-neutral-500">Galleries stored in the bucket</legend>
        <label className="flex items-center gap-2 py-1">
          <input type="radio" name="galleries-scope" checked={allGalleries} onChange={() => setAllGalleries(true)} /> All galleries
        </label>
        <label className="flex items-center gap-2 py-1">
          <input type="radio" name="galleries-scope" checked={!allGalleries} onChange={() => setAllGalleries(false)} /> Only these
        </label>
        {noneTicked && <p role="alert" className="pl-6 text-red-700 dark:text-red-400">Tick at least one gallery, or choose All galleries.</p>}
        {!allGalleries && (
          <ul className="max-h-48 space-y-1 overflow-auto pl-6">
            {galleries.map((g) => (
              <li key={g.id}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={v.galleries.includes(g.id)} onChange={() => toggleGallery(g.id)} />
                  {g.title}
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="text-neutral-500">New uploads in these galleries go to the bucket. Photos already uploaded move with the migrate script (docs/OBJECT-STORAGE.md).</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy !== null} onClick={() => call('test')} className="border border-neutral-900 px-4 py-1.5 text-xs uppercase dark:border-neutral-100">
          {busy === 'test' ? 'Testing…' : 'Test connection'}
        </button>
        <button type="button" disabled={busy !== null || noneTicked} onClick={() => call('save')} className="border border-neutral-900 bg-neutral-900 px-4 py-1.5 text-xs uppercase text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900">
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
        {v.source === 'ui' && (
          <button type="button" disabled={busy !== null} onClick={() => call('reset')} className="text-xs underline">
            Reset to environment
          </button>
        )}
      </div>
      <p role={msg && !msg.ok ? 'alert' : 'status'} className={`min-h-4 text-xs ${msg?.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
        {msg?.text}
      </p>
    </section>
  );
}
