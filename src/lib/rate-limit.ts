const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

type Entry = { failures: number[] };

const globalForRl = globalThis as unknown as {
  __pwRateLimit?: Map<string, Entry>;
};
const store = (globalForRl.__pwRateLimit ??= new Map());

function prune(entry: Entry, now: number) {
  entry.failures = entry.failures.filter((t) => now - t < WINDOW_MS);
}

/** True if this IP has exhausted its password attempts (should get a 429). */
export function isRateLimited(ip: string): boolean {
  const entry = store.get(ip);
  if (!entry) return false;
  prune(entry, Date.now());
  return entry.failures.length >= MAX_FAILURES;
}

export function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = store.get(ip) ?? { failures: [] };
  prune(entry, now);
  entry.failures.push(now);
  store.set(ip, entry);
}

export function clearFailures(ip: string): void {
  store.delete(ip);
}

export function ipFromRequest(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
