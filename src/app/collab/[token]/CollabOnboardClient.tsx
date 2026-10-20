'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';
import { formatMsg, t, type Lang } from '@/lib/i18n';

export default function CollabOnboardClient({
  token,
  valid,
  galleryTitle,
  lang,
}: {
  token: string;
  valid: boolean;
  galleryTitle: string | null;
  lang: Lang;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasPasskey, setHasPasskey] = useState(false);

  async function setUp() {
    setStatus('busy');
    setError(null);
    try {
      const optRes = await fetch('/api/collab/register/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (optRes.status === 409) {
        setStatus('done');
        setTimeout(() => router.push('/admin/login'), 2500);
        setError(null);
        setHasPasskey(true);
        return;
      }
      if (!optRes.ok) {
        const data = await optRes.json().catch(() => null);
        setError(data?.error ?? t(lang, 'somethingWrong'));
        setStatus('error');
        return;
      }
      const options = await optRes.json();
      const attestation = await startRegistration({ optionsJSON: options });
      const verifyRes = await fetch('/api/collab/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, response: attestation, label: 'Collaborator passkey' }),
      });
      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => null);
        setError(data?.error ?? t(lang, 'somethingWrong'));
        setStatus('error');
        return;
      }
      setStatus('done');
      setTimeout(() => router.push('/admin'), 1200);
    } catch {
      setError(t(lang, 'somethingWrong'));
      setStatus('error');
    }
  }

  if (!valid) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-6 text-center">
        <h1 className="mb-2 text-lg font-medium">{t(lang, 'collabInviteInvalidTitle')}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {t(lang, 'collabInviteInvalidBody')}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="mb-2 text-lg font-medium">
          {galleryTitle
            ? formatMsg(lang, 'collabSetupTitleGallery', { gallery: galleryTitle })
            : t(lang, 'collabSetupTitle')}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {t(lang, 'collabSetupIntro')}
        </p>
      </div>
      {status === 'done' ? (
        <p className="text-sm text-green-600 dark:text-green-400">
          {t(lang, hasPasskey ? 'collabAlreadyHasPasskey' : 'collabSetupDone')}
        </p>
      ) : (
        <button
          type="button"
          disabled={status === 'busy'}
          onClick={setUp}
          className="border border-neutral-900 px-5 py-2 text-sm tracking-widest uppercase transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-50 dark:border-neutral-100 dark:hover:bg-neutral-100 dark:hover:text-neutral-900"
        >
          {status === 'busy' ? t(lang, 'collabSetupBusy') : t(lang, 'collabSetupButton')}
        </button>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
