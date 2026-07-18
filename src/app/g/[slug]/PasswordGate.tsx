'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LockedShell from './LockedShell';
import type { Lang } from '@/lib/i18n';
import { t } from '@/lib/i18n';

export default function PasswordGate({
  slug,
  title,
  lang,
  coverPlaceholder,
}: {
  slug: string;
  title: string;
  lang: Lang;
  coverPlaceholder?: string | null;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/g/${slug}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
    } else if (res.status === 429) {
      setError(t(lang, 'tooManyAttempts'));
    } else {
      setError(t(lang, 'incorrectPassword'));
    }
  }

  return (
    <LockedShell title={title} coverPlaceholder={coverPlaceholder}>
      <form onSubmit={submit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t(lang, 'password')}
          autoFocus
          className="w-full border-b border-neutral-300 bg-transparent py-2 text-center text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
        />
        {error && (
          <p className="mt-4 text-center text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-8 w-full border border-neutral-900 py-2 text-xs tracking-widest uppercase transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-40 dark:border-neutral-100 dark:hover:bg-neutral-100 dark:hover:text-black"
        >
          {busy ? t(lang, 'checking') : t(lang, 'enter')}
        </button>
      </form>
    </LockedShell>
  );
}
