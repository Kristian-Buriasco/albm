import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import {
  clearFailures,
  ipFromRequest,
  isRateLimited,
  recordFailure,
} from '@/lib/rate-limit';
import { errorJson, json } from '@/lib/api';
import {
  getPasskeyByCredentialId,
  updatePasskeyAfterAuth,
} from '@/lib/passkey-store';
import { consumeAuthChallenge } from '@/lib/passkey-challenge';
import { expectedOrigin, rpId } from '@/lib/webauthn-config';
import { issueAdminSession } from '@/lib/session';

const RL_SCOPE = 'admin-passkey-auth';

export async function POST(req: Request) {
  const ip = ipFromRequest(req);
  if (isRateLimited(RL_SCOPE, ip)) {
    return errorJson('Too many attempts. Try again later.', 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    recordFailure(RL_SCOPE, ip);
    return errorJson('Invalid request', 400);
  }

  const response =
    typeof body === 'object' && body !== null && 'response' in body
      ? (body as { response: AuthenticationResponseJSON }).response
      : null;

  if (!response?.id) {
    recordFailure(RL_SCOPE, ip);
    return errorJson('Invalid request', 400);
  }

  const expectedChallenge = await consumeAuthChallenge();
  if (!expectedChallenge) {
    recordFailure(RL_SCOPE, ip);
    return errorJson('Authentication challenge expired or missing', 400);
  }

  const stored = getPasskeyByCredentialId(response.id);
  if (!stored) {
    recordFailure(RL_SCOPE, ip);
    return errorJson('Unknown passkey', 401);
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: expectedOrigin(),
      expectedRPID: rpId(),
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(stored.publicKey as ArrayBuffer),
        counter: stored.counter,
        transports: stored.transports
          ? (JSON.parse(stored.transports) as AuthenticatorTransport[])
          : undefined,
      },
      requireUserVerification: true,
    });
  } catch {
    recordFailure(RL_SCOPE, ip);
    return errorJson('Passkey verification failed', 401);
  }

  if (!verification.verified || !verification.authenticationInfo) {
    recordFailure(RL_SCOPE, ip);
    return errorJson('Passkey verification failed', 401);
  }

  const { newCounter } = verification.authenticationInfo;
  // Clone detection via signature counter only applies to authenticators that
  // actually implement one. Synced passkeys (iCloud, Google Password Manager)
  // always report 0 — treat a regression as suspicious ONLY when the counter
  // is in use (newCounter > 0), otherwise a 0/0 authenticator can never log in.
  if (newCounter > 0 && newCounter <= stored.counter) {
    recordFailure(RL_SCOPE, ip);
    return errorJson('Passkey verification failed', 401);
  }

  clearFailures(RL_SCOPE, ip);
  updatePasskeyAfterAuth(stored.id, newCounter, Date.now());
  await issueAdminSession({
    userAgent: req.headers.get('user-agent'),
    ip,
  });
  return json({ ok: true });
}
