'use client';

import { useState } from 'react';

type Pick = { id: string; filename: string };

export default function CarouselPanel({ galleryId }: { galleryId: string }) {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [caption, setCaption] = useState('');
  const [engine, setEngine] = useState<'sharp' | 'claude'>('sharp');
  const [fit, setFit] = useState<'crop' | 'pad'>('crop');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/carousel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ engine }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setPicks(data.picks);
      setCaption(data.caption ?? '');
      setInfo(data.note ?? (`Picked by ${{ claude: 'Claude', sharp: 'sharpness and spread' }[data.source as string]}.`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  const move = (i: number, d: number) =>
    setPicks((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const n = [...p];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const zipHref = `/api/admin/galleries/${galleryId}/carousel/zip?fit=${fit}&ids=${picks.map((p) => p.id).join(',')}`;

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium">Instagram carousel</h2>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Picks up to 10 of the best photos and exports them as 1080×1350 JPEGs (4:5). Reorder or remove before download.
      </p>
      <label className="block space-y-1 text-xs">
        <span>Ranking</span>
        <select value={engine} onChange={(e) => setEngine(e.target.value as typeof engine)} className="block bg-transparent">
          <option value="sharp">Local: sharpness, exposure and spread (instant, private)</option>
          <option value="claude">Claude (best taste; sends 768 px previews to Anthropic, not for client galleries)</option>
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} disabled={busy} className="border border-neutral-900 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-neutral-100">
          {busy ? 'Picking…' : picks.length ? 'Pick again' : 'Pick best photos'}
        </button>
        <select value={fit} onChange={(e) => setFit(e.target.value as 'crop' | 'pad')} className="bg-transparent text-xs">
          <option value="crop">Crop to fill</option>
          <option value="pad">Keep whole photo (blurred bars)</option>
        </select>
        {picks.length > 0 && (
          <a href={zipHref} className="text-xs underline">
            Download zip
          </a>
        )}
      </div>
      {info && <p className="text-xs text-neutral-500">{info}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {picks.length > 0 && (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {picks.map((p, i) => (
            <li key={p.id} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/img/${p.id}/thumb`} alt={p.filename} className="aspect-[4/5] w-full object-cover" />
              <div className="flex items-center justify-between text-xs">
                <span>{i + 1}</span>
                <span className="space-x-2">
                  <button type="button" onClick={() => move(i, -1)} aria-label="Move earlier">←</button>
                  <button type="button" onClick={() => move(i, 1)} aria-label="Move later">→</button>
                  <button type="button" onClick={() => setPicks((x) => x.filter((_, k) => k !== i))} aria-label="Remove">×</button>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {caption && (
        <div className="space-y-1">
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} className="w-full border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
          <button type="button" onClick={() => navigator.clipboard?.writeText(caption)} className="text-xs underline">
            Copy caption
          </button>
        </div>
      )}
    </section>
  );
}
