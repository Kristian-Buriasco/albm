'use client';

import { openCookieSettings } from '@/components/CookieConsent';
import { t, type Lang } from '@/lib/i18n';

export default function CookieSettingsLink({ lang }: { lang: Lang }) {
  return (
    <button
      type="button"
      onClick={() => openCookieSettings()}
      className="text-left underline underline-offset-2 transition-colors hover:text-ink dark:hover:text-ink-dark"
    >
      {t(lang, 'cookieSettings')}
    </button>
  );
}
