'use client';

import { useState } from 'react';

type DerivativeKind = 'thumb' | 'md' | 'web' | 'workingJpeg' | 'print';

type MissingPhoto = {
  photoId: string;
  filename: string;
  missingKinds: DerivativeKind[];
};

type GalleryIntegrityReport = {
  galleryId: string;
  title: string;
  total: number;
  missingCount: number;
  missing: MissingPhoto[];
};

type StorageState = 'ok' | 'warn' | 'over';

type GalleryStorageUsage = {
  galleryId: string;
  title: string;
  usedBytes: number;
  quotaBytes: number | null;
  pct: number | null;
  state: StorageState;
};

type ScanResponse = {
  integrity: {
    galleries: GalleryIntegrityReport[];
    totalPhotos: number;
    totalMissing: number;
  };
  storage: {
    galleries: GalleryStorageUsage[];
    volume: { totalBytes: number; usedBytes: number; freeBytes: number };
  };
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

const stateColor: Record<StorageState, string> = {
  ok: 'text-neutral-500 dark:text-neutral-400',
  warn: 'text-amber-600 dark:text-amber-400',
  over: 'text-red-600 dark:text-red-400',
};

export default function AdminMaintenanceClient({
  initialVolume,
  formattedTotal,
  formattedUsed,
  formattedFree,
}: {
  initialVolume: { totalBytes: number; usedBytes: number; freeBytes: number };
  formattedTotal: string;
  formattedUsed: string;
  formattedFree: string;
}) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const volumePct = (initialVolume.usedBytes / Math.max(1, initialVolume.totalBytes)) * 100;

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/maintenance/scan');
      if (!res.ok) {
        setError('Scan failed.');
        return;
      }
      setResult(await res.json());
    } catch {
      setError('Scan failed.');
    } finally {
      setScanning(false);
    }
  }

  async function regenerateGallery(galleryId: string) {
    setRegeneratingId(galleryId);
    setError(null);
    try {
      const res = await fetch('/api/admin/maintenance/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ galleryId }),
      });
      if (!res.ok) {
        setError('Regeneration failed.');
        return;
      }
      await runScan();
    } catch {
      setError('Regeneration failed.');
    } finally {
      setRegeneratingId(null);
    }
  }

  async function regeneratePhoto(photoId: string) {
    setRegeneratingId(photoId);
    setError(null);
    try {
      const res = await fetch('/api/admin/maintenance/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId }),
      });
      if (!res.ok) {
        setError('Regeneration failed.');
        return;
      }
      await runScan();
    } catch {
      setError('Regeneration failed.');
    } finally {
      setRegeneratingId(null);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="mb-6 text-sm font-medium tracking-widest uppercase">
          Maintenance
        </h1>

        <section className="mb-10">
          <h2 className="mb-3 text-xs font-medium tracking-widest uppercase text-neutral-500">
            Storage
          </h2>
          <div className="border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span>
                {formattedUsed} used of {formattedTotal}
              </span>
              <span className="text-xs text-neutral-500">{formattedFree} free</span>
            </div>
            <div className="h-1.5 w-full bg-neutral-100 dark:bg-neutral-900">
              <div
                className="h-full bg-neutral-900 dark:bg-neutral-100"
                style={{ width: `${Math.min(100, volumePct)}%` }}
              />
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="text-xs font-medium tracking-widest uppercase text-neutral-500">
              Derivative integrity
            </h2>
            <button
              type="button"
              disabled={scanning}
              onClick={runScan}
              className="border border-neutral-900 px-4 py-1.5 text-xs tracking-widest uppercase transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-40 dark:border-neutral-100 dark:hover:bg-neutral-100 dark:hover:text-black"
            >
              {scanning ? 'Scanning…' : 'Run integrity scan'}
            </button>
          </div>

          {error && (
            <p className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p>
          )}

          {!result && !scanning && (
            <p className="text-xs text-neutral-500">
              Run a scan to check every ready photo for missing derivative files.
            </p>
          )}

          {result && (
            <div className="space-y-6">
              <p className="text-xs text-neutral-500">
                {result.integrity.totalMissing} of {result.integrity.totalPhotos} ready
                photo{result.integrity.totalPhotos === 1 ? '' : 's'} missing at least one
                derivative.
              </p>

              {result.integrity.galleries
                .filter((g) => g.missingCount > 0)
                .map((g) => {
                  const usage = result.storage.galleries.find(
                    (s) => s.galleryId === g.galleryId,
                  );
                  return (
                    <div
                      key={g.galleryId}
                      className="border border-neutral-200 p-4 dark:border-neutral-800"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-sm font-medium">{g.title}</span>
                          <span className="ml-2 text-xs text-neutral-500">
                            {g.missingCount} of {g.total} photos missing derivatives
                          </span>
                          {usage && (
                            <span className={`ml-2 text-xs ${stateColor[usage.state]}`}>
                              {formatBytes(usage.usedBytes)}
                              {usage.quotaBytes != null &&
                                ` / ${formatBytes(usage.quotaBytes)}`}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={regeneratingId === g.galleryId}
                          onClick={() => regenerateGallery(g.galleryId)}
                          className="border border-neutral-300 px-3 py-1 text-xs tracking-widest uppercase transition-colors hover:border-neutral-900 disabled:opacity-40 dark:border-neutral-700"
                        >
                          {regeneratingId === g.galleryId ? 'Working…' : 'Regenerate all'}
                        </button>
                      </div>
                      <ul className="divide-y divide-neutral-100 text-xs dark:divide-neutral-900">
                        {g.missing.map((m) => (
                          <li
                            key={m.photoId}
                            className="flex flex-wrap items-center justify-between gap-2 py-2"
                          >
                            <div>
                              <span className="font-mono">{m.filename}</span>
                              <span className="ml-2 text-neutral-500">
                                missing: {m.missingKinds.join(', ')}
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={regeneratingId === m.photoId}
                              onClick={() => regeneratePhoto(m.photoId)}
                              className="text-neutral-500 underline underline-offset-4 hover:text-neutral-900 disabled:opacity-40 dark:hover:text-neutral-100"
                            >
                              {regeneratingId === m.photoId ? 'Working…' : 'Regenerate'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}

              {result.integrity.totalMissing === 0 && (
                <p className="text-xs text-neutral-500">
                  All ready photos have their expected derivatives.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
