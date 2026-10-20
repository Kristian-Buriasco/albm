import { generateRegistrationOptions } from '@simplewebauthn/server';
import { errorJson, json } from '@/lib/api';
import { peekInvite } from '@/lib/collaborators';
import { listPasskeysForCollaborator } from '@/lib/passkey-store';
import { storeCollabRegisterChallenge } from '@/lib/passkey-challenge';
import { rpId, rpName } from '@/lib/webauthn-config';
import {
  ipFromRequest,
  isRateLimited,
  recordFailure,
  PASSKEY_CHALLENGE_RL,
} from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const RL_SCOPE = 'collab-register-options';

export async function POST(req: Request) {
  const ip = ipFromRequest(req);
  if (isRateLimited(RL_SCOPE, ip, PASSKEY_CHALLENGE_RL)) {
    return errorJson('Too many attempts. Try again later.', 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    recordFailure(RL_SCOPE, ip, PASSKEY_CHALLENGE_RL);
    return errorJson('Invalid request', 400);
  }
  const token =
    typeof body === 'object' && body !== null && typeof (body as { token?: unknown }).token === 'string'
      ? (body as { token: string }).token
      : '';
  if (!token) {
    recordFailure(RL_SCOPE, ip, PASSKEY_CHALLENGE_RL);
    return errorJson('Invalid request', 400);
  }

  // Peek only — does not consume the invite. Verify re-checks + consumes.
  const invite = peekInvite(token);
  if (!invite) {
    recordFailure(RL_SCOPE, ip, PASSKEY_CHALLENGE_RL);
    return errorJson('Invite is invalid, expired, or already used', 400);
  }

  // Same email invited to another gallery: the grant is already added, and the device's existing
  // passkey would make registration fail (excludeCredentials), so send them to sign in instead.
  const existing = listPasskeysForCollaborator(invite.collaboratorId);
  if (existing.length > 0) return json({ alreadyRegistered: true }, 409);
  const options = await generateRegistrationOptions({
    rpName: rpName(),
    rpID: rpId(),
    userName: invite.email,
    userDisplayName: invite.email,
    userID: Buffer.from(invite.collaboratorId, 'utf8'),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports
        ? (JSON.parse(c.transports) as AuthenticatorTransport[])
        : undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  await storeCollabRegisterChallenge(options.challenge, invite.collaboratorId);
  return json(options);
}
