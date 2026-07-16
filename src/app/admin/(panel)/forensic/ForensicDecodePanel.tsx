'use client';

import { useState } from 'react';

export default function ForensicDecodePanel() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decode() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/admin/forensic-decode', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Decode failed');
        return;
      }
      setResult(data);
    } catch {
      setError('Decode failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h1 className="text-xl font-medium tracking-wide">Forensic decode</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Upload a suspected leaked JPEG to recover the per-download mark and visitor.
        </p>
      </div>
      <input
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm"
      />
      <button
        type="button"
        disabled={!file || busy}
        onClick={decode}
        className="rounded border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
      >
        {busy ? 'Decoding…' : 'Decode'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <pre className="overflow-auto rounded border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-900">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
