import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { nanoid } from 'nanoid';
import { requireAdmin, errorJson, json } from '@/lib/api';
import { insertPasskey, passkeyCount } from '@/lib/passkey-store';
import { consumeRegisterChallenge } from '@/lib/passkey-challenge';
import { expectedOrigin, rpId } from '@/lib/webauthn-config';
import { regenerateRecoveryCodes } from '@/lib/recovery-codes';
import { logAdmin } from '@/lib/audit-log';

const LABEL_MAX = 100;

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  if (typeof body !== 'object' || body === null) {
    return errorJson('Invalid request', 400);
  }

  const { response, label } = body as {
    response?: RegistrationResponseJSON;
    label?: unknown;
  };

  if (!response || typeof label !== 'string' || label.trim().length === 0) {
    return errorJson('Invalid request', 400);
  }
  const trimmedLabel = label.trim().slice(0, LABEL_MAX);

  const expectedChallenge = await consumeRegisterChallenge();
  if (!expectedChallenge) {
    return errorJson('Registration challenge expired or missing', 400);
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: expectedOrigin(),
      expectedRPID: rpId(),
      requireUserVerification: true,
    });
  } catch {
    return errorJson('Passkey verification failed', 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return errorJson('Passkey verification failed', 400);
  }

  const { credential } = verification.registrationInfo;
  const transports =
    credential.transports && credential.transports.length > 0
      ? JSON.stringify(credential.transports)
      : null;

  const isFirst = passkeyCount() === 0;
  insertPasskey({
    id: nanoid(),
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey),
    counter: credential.counter,
    transports,
    label: trimmedLabel,
  });

  let recoveryCodes: string[] | undefined;
  if (isFirst) {
    recoveryCodes = await regenerateRecoveryCodes();
  }

  logAdmin('passkey.add', {
    targetType: 'passkey',
    targetId: credential.id.slice(0, 16),
    summary: `Registered passkey "${trimmedLabel}"`,
  });

  return json({ ok: true, recoveryCodes });
}
