import Link from 'next/link';
import ThemeToggle from './ThemeToggle';
import AdminLoginButton from './AdminLoginButton';

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Kristian Buriasco';

const navLink =
  'text-muted transition-colors hover:text-ink dark:text-muted-dark dark:hover:text-ink-dark';

export default function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-7">
      <Link
        href="/"
        className="text-[15px] leading-none font-semibold tracking-tight"
      >
        {SITE_NAME}
      </Link>
      <nav className="flex items-center gap-7 text-[13px] tracking-wide">
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
