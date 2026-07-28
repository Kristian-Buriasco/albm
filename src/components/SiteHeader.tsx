import Link from 'next/link';
import ThemeToggle from './ThemeToggle';
import AdminLoginButton from './AdminLoginButton';

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Kristian Buriasco';

const navLink =
  'text-muted transition-colors hover:text-ink dark:text-muted-dark dark:hover:text-ink-dark';

export default function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-7 sm:px-6">
      <Link
        href="/"
        className="min-w-0 truncate text-[15px] leading-none font-semibold tracking-tight"
      >
        {SITE_NAME}
      </Link>
      <nav className="flex shrink-0 items-center gap-3 text-[13px] tracking-wide sm:gap-7">
        <Link href="/" className={navLink}>
          Work
        </Link>
        <Link href="/about" className={navLink}>
          About
        </Link>
        <Link href="/contact" className={navLink}>
          Contact
        </Link>
        <span className="h-4 w-px bg-line dark:bg-line-dark" aria-hidden="true" />
        <ThemeToggle />
        <AdminLoginButton />
      </nav>
    </header>
  );
}
