'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CONSENT_ANALYTICS,
  CONSENT_COOKIE,
  CONSENT_NECESSARY,
  parseConsent,
  type ConsentChoice,
} from '@/lib/consent';
import { t, type Lang } from '@/lib/i18n';

const MAX_AGE_DAYS = 365;

function readConsent(): ConsentChoice | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`));
  return parseConsent(match ? decodeURIComponent(match[1]) : null);
}

function writeConsent(choice: ConsentChoice) {
  const maxAge = MAX_AGE_DAYS * 24 * 60 * 60;
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(choice)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export default function CookieConsent({ lang }: { lang: Lang }) {
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const existing = readConsent();
    setChoice(existing);
    setOpen(existing === null);
    setHydrated(true);

    function onOpen() {
      setOpen(true);
    }
    window.addEventListener('open-cookie-settings', onOpen);
    return () => window.removeEventListener('open-cookie-settings', onOpen);
  }, []);

  const save = useCallback((next: ConsentChoice) => {
    writeConsent(next);
    setChoice(next);
    setOpen(false);
    // Reload so server layout can pick up analytics injection.
    window.location.reload();
  }, []);

  if (!hydrated || !open) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-paper/95 p-4 shadow-lg backdrop-blur dark:border-line-dark dark:bg-paper-dark/95"
      role="dialog"
      aria-label={t(lang, 'cookieTitle')}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-medium">{t(lang, 'cookieTitle')}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted dark:text-muted-dark">
            {t(lang, 'cookieBody')}
          </p>
          {choice && (
            <p className="mt-1 text-[12px] text-muted dark:text-muted-dark">
              {choice === CONSENT_ANALYTICS
                ? t(lang, 'cookieAnalyticsOn')
                : t(lang, 'cookieAnalyticsOff')}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => save(CONSENT_NECESSARY)}
            className="border border-line px-4 py-2 text-xs tracking-widest uppercase transition-colors hover:border-ink dark:border-line-dark dark:hover:border-ink-dark"
          >
            {t(lang, 'cookieDecline')}
          </button>
          <button
            type="button"
            onClick={() => save(CONSENT_ANALYTICS)}
            className="border border-ink bg-ink px-4 py-2 text-xs tracking-widest text-paper uppercase transition-colors dark:border-ink-dark dark:bg-ink-dark dark:text-paper-dark"
          >
            {t(lang, 'cookieAccept')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function openCookieSettings() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('open-cookie-settings'));
  }
}
