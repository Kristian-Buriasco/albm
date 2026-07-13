import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './env';

export interface DiskUsage {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
}

export function volumeUsage(): DiskUsage {
  const s = fs.statfsSync(DATA_DIR);
  const total = s.blocks * s.bsize;
  const free = s.bavail * s.bsize;
  return { totalBytes: total, freeBytes: free, usedBytes: total - free };
}

export function dirSizeBytes(dir: string): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += dirSizeBytes(p);
    else if (e.isFile()) {
      try {
        total += fs.statSync(p).size;
      } catch {
        /* file vanished */
      }
    }
  }
  return total;
}

export function formatBytes(n: number): string {
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
