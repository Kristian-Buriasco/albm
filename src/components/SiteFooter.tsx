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
          <a
            href="https://github.com/Kristian-Buriasco/albm"
            target="_blank"
            rel="noopener"
            className="text-[11px] opacity-70 underline-offset-2 hover:underline hover:opacity-100"
          >
            Powered by Albm
          </a>
        </div>
      </div>
    </footer>
  );
}
