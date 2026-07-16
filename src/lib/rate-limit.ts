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

export function ipFromRequest(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return parts[parts.length - 1] ?? 'unknown';
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
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
 * distributed (IP-rotating) attacker: 20/15min ≈ 1,920/day, so even the
 * full 1e6 six-digit keyspace stays ~a year out of reach.
 */
export function pinRateLimitOpts(slug: string): RateLimitOpts {
  return {
    maxPerIp: 5,
    maxGlobal: 20,
    windowMs: WINDOW_MS,
    logLabel: `gallery-pin:${slug}`,
  };
}
