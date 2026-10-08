import { hitCount, recordHit, clearHits } from '@/lib/rate-limit-store';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IP = 10;
const MAX_FAILURES_GLOBAL = 100;

export type RateLimitOpts = {
  maxPerIp?: number;
  maxGlobal?: number;
  windowMs?: number;
  logLabel?: string;
};

const DEFAULT_OPTS: Required<RateLimitOpts> = {
  maxPerIp: MAX_FAILURES_PER_IP,
  maxGlobal: MAX_FAILURES_GLOBAL,
  windowMs: WINDOW_MS,
  logLabel: '',
};

/**
 * True if this IP (or the endpoint globally) has exhausted its attempts
 * and should get a 429. `scope` identifies the endpoint.
 */
export function isRateLimited(
  scope: string,
  ip: string,
  opts: RateLimitOpts = {},
): boolean {
  const o = { ...DEFAULT_OPTS, ...opts };
  const limited =
    hitCount(`${scope}:ip:${ip}`, o.windowMs) >= o.maxPerIp ||
    hitCount(`${scope}:global`, o.windowMs) >= o.maxGlobal;
  if (limited && o.logLabel) {
    console.log(`[rate-limit] throttled ${o.logLabel} ip=${ip}`);
  }
  return limited;
}

export function recordFailure(
  scope: string,
  ip: string,
  opts: RateLimitOpts = {},
): void {
  const o = { ...DEFAULT_OPTS, ...opts };
  recordHit(`${scope}:ip:${ip}`, o.windowMs);
  recordHit(`${scope}:global`, o.windowMs);
}

export function clearFailures(scope: string, ip: string): void {
  clearHits(`${scope}:ip:${ip}`);
}

/** Write counter per scope+IP (likes, visitor POST, etc.). */
export function writeAllowed(
  scope: string,
  ip: string,
  max: number,
  windowMs: number,
): boolean {
  const key = `${scope}:${ip}`;
  const count = hitCount(key, windowMs);
  if (count >= max) return false;
  recordHit(key, windowMs);
  return true;
}

/**
 * Best-effort client IP from proxy headers. If CLIENT_IP_HEADER is set (e.g.
 * `cf-connecting-ip` behind Cloudflare), that header wins — only set it when
 * the edge proxy always overwrites it. Otherwise the LAST X-Forwarded-For hop
 * is used, which is the address the nearest proxy saw (the client only when
 * exactly one proxy fronts the app); TRUSTED_PROXY_HOPS skips further proxies.
 */
export function ipFromHeaders(h: Pick<Headers, 'get'>): string {
  const preferred = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (preferred) {
    const v = h.get(preferred)?.split(',')[0]?.trim();
    if (v) return v;
  }
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const parts = xff
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // TRUSTED_PROXY_HOPS = proxies in front of the app BEYOND the one that
    // appended the last entry (e.g. Cloudflare -> nginx: the last entry is
    // Cloudflare's edge, so set 1 to take the client address before it).
    // Entries to the left of those hops are client-supplied and ignored.
    const hops = Math.max(0, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '0', 10) || 0);
    return parts[Math.max(0, parts.length - 1 - hops)] ?? 'unknown';
  }
  return h.get('x-real-ip') ?? 'unknown';
}

export function ipFromRequest(req: Request): string {
  return ipFromHeaders(req.headers);
}

/** Standard auth attempt limits: 10 / 15 min per IP. */
export const AUTH_RL: RateLimitOpts = {
  maxPerIp: 10,
  maxGlobal: 100,
  windowMs: WINDOW_MS,
  logLabel: 'auth',
};

/** Passkey challenge/options: 30 / 15 min per IP. */
export const PASSKEY_CHALLENGE_RL: RateLimitOpts = {
  maxPerIp: 30,
  maxGlobal: 200,
  windowMs: WINDOW_MS,
  logLabel: 'passkey-challenge',
};

/**
 * Gallery PIN gate: stricter, scoped per slug. The global cap bounds a
 * distributed (IP-rotating) attacker: 60/15min ≈ 5,760/day, so the full 1e6
 * six-digit keyspace still takes ~half a year to exhaust (expected hit ~3 mo).
 * The cap is deliberately not tiny: at an event many guests type the shared
 * PIN at once, and a handful of typos must not lock the whole gallery out.
 */
export function pinRateLimitOpts(slug: string): RateLimitOpts {
  return {
    maxPerIp: 10,
    maxGlobal: 60,
    windowMs: WINDOW_MS,
    logLabel: `gallery-pin:${slug}`,
  };
}
