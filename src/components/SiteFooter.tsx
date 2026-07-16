import { getSetting } from '@/lib/settings';
import { parseLang } from '@/lib/i18n';
import CookieSettingsLink from '@/components/CookieSettingsLink';

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Kristian Buriasco';

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
          <p>{SITE_NAME}</p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <CookieSettingsLink lang={lang} />
          <p className="tabular-nums">
            © {year} {SITE_NAME}
          </p>
        </div>
      </div>
    </footer>
  );
}
