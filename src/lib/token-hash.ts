import crypto from 'node:crypto';

/** SHA-256 hex digest of a bearer token (never store or log the raw token). */
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Constant-time compare of two hex hash strings. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

/** Generate a URL-safe bearer token (show once to the user). */
export function generateBearerToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
