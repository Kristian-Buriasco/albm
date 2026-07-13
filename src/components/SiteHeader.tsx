import Link from 'next/link';
import ThemeToggle from './ThemeToggle';

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Kristian Buriasco';

export default function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <Link href="/" className="text-sm font-medium tracking-widest uppercase">
        {SITE_NAME}
      </Link>
      <nav className="flex items-center gap-6 text-sm text-neutral-500 dark:text-neutral-400">
        <Link href="/" className="transition-colors hover:text-neutral-900 dark:hover:text-neutral-100">
          Work
        </Link>
        <Link href="/about" className="transition-colors hover:text-neutral-900 dark:hover:text-neutral-100">
          About
        </Link>
        <Link href="/contact" className="transition-colors hover:text-neutral-900 dark:hover:text-neutral-100">
          Contact
        </Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
