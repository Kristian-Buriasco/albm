import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import './globals.css';
import AnalyticsHead from '@/components/AnalyticsHead';
import CookieConsent from '@/components/CookieConsent';
import { hasAnalyticsConsent, CONSENT_COOKIE } from '@/lib/consent';
import { getSetting } from '@/lib/settings';
import { BASE_URL } from '@/lib/env';
import { parseLang } from '@/lib/i18n';

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Albm';

export const metadata: Metadata = {
  title: SITE_NAME,
  description: `${SITE_NAME} — photography`,
};

// Applied before paint to avoid a flash of the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = (await headers()).get('x-pathname') ?? '';
  const isPublicPage = !pathname.startsWith('/admin');
  const cookieStore = await cookies();
  const consent = cookieStore.get(CONSENT_COOKIE)?.value;
  const rawAnalyticsHtml = isPublicPage ? (getSetting('analytics_head_html') ?? '').trim() : '';
  // Google Consent Mode v2: the tag itself always loads (so Google's install
  // verifier — and any real analytics — actually sees it), but it starts out
  // denied. It's only flipped to granted here once the visitor has accepted
  // the cookie banner; nothing is collected before that either way. Because
  // choosing a cookie preference does a full page reload (see
  // CookieConsent.tsx), this server-known value always matches the visitor's
  // actual choice — no client-side "update" call needed.
  const analyticsStorage = hasAnalyticsConsent(consent) ? 'granted' : 'denied';
  const consentDefaultScript = rawAnalyticsHtml
    ? `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'${analyticsStorage}'});`
    : '';
  const htmlLang = parseLang(getSetting('defaultLanguage'));

  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="manifest" href="/manifest.json" />
        {isPublicPage && (
          <>
            <link rel="alternate" type="application/rss+xml" href={`${BASE_URL}/feed.xml`} title="Portfolio RSS" />
            <link rel="alternate" type="application/feed+json" href={`${BASE_URL}/feed.json`} title="Portfolio JSON Feed" />
          </>
        )}
        {consentDefaultScript && (
          <script dangerouslySetInnerHTML={{ __html: consentDefaultScript }} />
        )}
        {rawAnalyticsHtml ? <AnalyticsHead html={rawAnalyticsHtml} /> : null}
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased dark:bg-paper-dark dark:text-ink-dark">
        {children}
        {isPublicPage ? <CookieConsent lang={htmlLang} /> : null}
      </body>
    </html>
  );
}
