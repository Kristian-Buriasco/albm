'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';

/**
 * Discreet admin entry point on public pages. Hidden until hovered/focused (or
 * triggered by Ctrl/Cmd+Shift+K). Runs the passkey flow directly; on any
 * failure (no passkey, cancel, error) it falls back to the full /admin/login.
 */
export default function AdminLoginButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signIn = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const optRes = await fetch('/api/admin/passkey/auth/options', {
        method: 'POST',
      });
      if (!optRes.ok) {
        router.push('/admin/login');
        return;
      }
      const options = await optRes.json();
      const assertion = await startAuthentication({ optionsJSON: options });
      const verifyRes = await fetch('/api/admin/passkey/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: assertion }),
      });
      if (verifyRes.ok) {
        router.push('/admin');
        router.refresh();
      } else {
        router.push('/admin/login');
      }
    } catch {
      // cancelled / no passkey / error — hand off to the full login page
      router.push('/admin/login');
    } finally {
      setBusy(false);
    }
  }, [busy, router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        void signIn();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [signIn]);

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={busy}
      aria-label="Admin sign-in"
      title="Admin sign-in (⌘/Ctrl+Shift+K)"
      className="opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 disabled:opacity-40 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
    >
      {/* key icon */}
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="7.5" cy="15.5" r="4.5" />
        <path d="M10.5 12.5 L21 2" />
        <path d="M16 7 L20 11" />
        <path d="M18 5 L21.5 8.5" />
      </svg>
    </button>
  );
}
