'use client';

import { useCallback, useEffect, useState } from 'react';

type Pick = { id: string; filename: string };
type Score = { done: number; pending: number; leased: number; error: number };

// Rough speed of a 7b vision model on an Apple-silicon Mac, measured at about 13 s per photo.
const SECS_PER_PHOTO = 13;

export default function CarouselPanel({ galleryId }: { galleryId: string }) {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [caption, setCaption] = useState('');
  const [engine, setEngine] = useState<'local' | 'claude'>('local');
  const [mode, setMode] = useState<'spread' | 'top' | 'sections'>('spread');
  const [count, setCount] = useState(10);
  const [fit, setFit] = useState<'crop' | 'pad'>('crop');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<Score | null>(null);

  const loadScore = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/carousel`);
      if (res.ok) setScore((await res.json()).score);
    } catch {
      /* progress is optional */
    }
  }, [galleryId]);

  useEffect(() => {
    void loadScore();
    // Refresh while the worker is busy so "N left" counts down without a reload.
    const t = setInterval(loadScore, 15000);
    return () => clearInterval(t);
  }, [loadScore]);

  async function run() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/carousel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ engine, mode, count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setPicks(data.picks);
      setCaption(data.caption ?? '');
      const by = data.source === 'claude' ? 'Claude' : data.scored ? `local AI scores (${data.scored} of ${data.total} photos scored) and sharpness` : 'sharpness and exposure';
      setInfo(data.note ?? `Picked by ${by}.`);
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
  const left = score ? score.pending + score.leased : 0;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const field = 'bg-transparent border-b border-neutral-300 dark:border-neutral-700';

  return (
    <section className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-sm font-medium">Instagram carousel</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Picks the best photos and exports them as 1080×1350 JPEGs (4:5). Reorder or remove before download.
        </p>
        <div className="flex flex-wrap items-end gap-4 text-xs">
          <label className="space-y-1">
            <span className="block">Photos</span>
            <input type="number" min={2} max={10} value={count} onChange={(e) => setCount(Math.min(10, Math.max(2, Number(e.target.value) || 10)))} className={`${field} w-16`} />
          </label>
          <label className="space-y-1">
            <span className="block">Choose</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className={field}>
              <option value="spread">Spread over the shoot</option>
              <option value="top">Top rated overall</option>
              <option value="sections">One per section</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block">Ranking</span>
            <select value={engine} onChange={(e) => setEngine(e.target.value as typeof engine)} className={field}>
              <option value="local">Local (private)</option>
              <option value="claude">Claude (best taste; sends 768 px previews to Anthropic, not for client galleries)</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block">Frame</span>
            <select value={fit} onChange={(e) => setFit(e.target.value as 'crop' | 'pad')} className={field}>
              <option value="crop">Crop to fill</option>
              <option value="pad">Whole photo, blurred bars</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={run} disabled={busy} className="border border-neutral-900 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-neutral-100">
            {busy ? 'Picking…' : picks.length ? 'Pick again' : 'Pick best photos'}
          </button>
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
      </div>

      <div className="space-y-2 border-t border-neutral-200 pt-4 text-xs dark:border-neutral-800">
        <h3 className="font-medium">Local AI scoring (optional, private)</h3>
        <p className="text-neutral-500 dark:text-neutral-400">
          A vision model on your own computer rates each photo once; the scores are saved and make every pick better. Photos never leave your machine
          and your server.
          {score && (
            <>
              {' '}
              <strong>{score.done} scored</strong>
              {left > 0 ? `, ${left} left (about ${Math.max(1, Math.round((left * SECS_PER_PHOTO) / 60))} min)` : score.done ? ', all done' : ''}
              {score.error > 0 ? `, ${score.error} failed` : ''}.
            </>
          )}
        </p>
        <p className="text-neutral-500 dark:text-neutral-400">
          One-time setup: install Ollama, run <code>ollama pull qwen2.5vl:7b</code>, make a worker token in Settings &gt; Sharing, then run this on your Mac and leave it going:
        </p>
        <pre className="overflow-x-auto bg-neutral-100 p-2 dark:bg-neutral-900">{`node worker/albm-worker.mjs --url ${origin} --token <worker token> --tasks score --gallery ${galleryId}`}</pre>
      </div>
    </section>
  );
}
