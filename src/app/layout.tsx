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
  const analyticsHtml =
    isPublicPage && hasAnalyticsConsent(consent)
      ? (getSetting('analytics_head_html') ?? '')
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
        {analyticsHtml ? <AnalyticsHead html={analyticsHtml} /> : null}
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased dark:bg-paper-dark dark:text-ink-dark">
        {children}
        {isPublicPage ? <CookieConsent lang={htmlLang} /> : null}
      </body>
    </html>
  );
}
