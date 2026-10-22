import { getSetting } from '@/lib/settings';
import { siteName } from '@/lib/site-name';
import { parseLang } from '@/lib/i18n';
import CookieSettingsLink from '@/components/CookieSettingsLink';


/** Public footer. Free-text content editable in admin (settings key `footerContent`). */
export default function SiteFooter() {
  const content = getSetting('footerContent')?.trim();
  const year = new Date().getFullYear();
  const lang = parseLang(getSetting('defaultLanguage'));

  return (
    <footer className="mt-24 border-t border-line dark:border-line-dark">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-10 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between dark:text-muted-dark">
        {content ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <p>{siteName()}</p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <CookieSettingsLink lang={lang} />
          <p className="tabular-nums">
            © {year} {siteName()}
          </p>
        </div>
      </div>
      <p className="mx-auto max-w-6xl px-6 pb-8 text-[11px] text-muted/70 dark:text-muted-dark/70">
        <a
          href="https://github.com/Kristian-Buriasco/albm"
          target="_blank"
          rel="noopener"
          className="underline-offset-2 hover:underline"
        >
          Powered by Albm
        </a>
      </p>
    </footer>
  );
}
