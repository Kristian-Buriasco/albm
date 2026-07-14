import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * First-run onboarding: if no ADMIN_PASSWORD_HASH is configured, generate a
 * random admin password, hash it for this process, and print the plaintext
 * once to the logs. Runs before any request (from instrumentation), and
 * because adminPasswordHash() reads process.env at call time, setting it here
 * is picked up by the login route.
 *
 * SESSION_SECRET is deliberately NOT auto-generated — it stays fail-fast in
 * production so sessions can't silently reset on restart.
 */
export function ensureAdminPassword(): void {
  if (process.env.ADMIN_PASSWORD_HASH) return;

  const pw = crypto.randomBytes(12).toString('base64url'); // ~16 chars
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(pw, 12);

  const line = '='.repeat(64);
  console.log(
    [
      '',
      line,
      '  FIRST RUN — no ADMIN_PASSWORD_HASH was set.',
      '  A temporary admin password has been generated:',
      '',
      `      ${pw}`,
      '',
      '  Log in at /admin/login with it, then set a passkey (Settings →',
      '  Security). This password REGENERATES on every restart until you',
      '  set ADMIN_PASSWORD_HASH in your environment.',
      '',
      '  Permanent hash:  node scripts/hash-password.mjs "your-password"',
      line,
      '',
    ].join('\n'),
  );
}
