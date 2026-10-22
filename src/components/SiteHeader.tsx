import Link from 'next/link';
import { getSetting } from '@/lib/settings';
import { DEFAULT_NAV, parseSiteTheme } from '@/lib/gallery-theme';
import { siteName } from '@/lib/site-name';
import ThemeToggle from './ThemeToggle';
import AdminLoginButton from './AdminLoginButton';


const navLink =
  '-my-3 py-3 text-muted transition-colors hover:text-ink dark:text-muted-dark dark:hover:text-ink-dark';

export default function SiteHeader() {
  const theme = parseSiteTheme(getSetting('siteTheme'));
  const locked = (theme?.mode ?? 'auto') !== 'auto';
  const nav = theme?.header ?? DEFAULT_NAV;
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6 sm:py-7">
      <Link
        href="/"
        className="-my-3 min-w-0 truncate py-3 text-[15px] leading-none font-semibold tracking-tight"
      >
        {nav.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={nav.logoUrl} alt={siteName()} className="block h-7 w-auto max-w-[12rem] object-contain" />
        ) : (
          siteName()
        )}
      </Link>
      <nav className="flex shrink-0 items-center gap-4 text-[13px] tracking-wide sm:gap-7">
        {/* Work = home; the logo already links there, so skip it on phones. */}
        {nav.work.show && (
          <Link href="/" className={`${navLink} max-sm:hidden`}>
            {nav.work.label || 'Work'}
          </Link>
        )}
        {nav.about.show && (
          <Link href="/about" className={navLink}>
            {nav.about.label || 'About'}
          </Link>
        )}
        {nav.contact.show && (
          <Link href="/contact" className={navLink}>
            {nav.contact.label || 'Contact'}
          </Link>
        )}
        {!locked && <span className="h-4 w-px max-sm:hidden bg-line dark:bg-line-dark" aria-hidden="true" />}
        <ThemeToggle />
        <AdminLoginButton />
      </nav>
    </header>
  );
}
