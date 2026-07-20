import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pendingCommentCount } from '@/lib/comments';
import { getPrincipal } from '@/lib/session';
import ThemeToggle from '@/components/ThemeToggle';
import UpdateBadge from '@/components/UpdateBadge';
import LogoutButton from './LogoutButton';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const principal = await getPrincipal();
  if (!principal) redirect('/admin/login');
  const isOwner = principal.role === 'owner';

  const pending = isOwner ? pendingCommentCount() : 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6 text-sm">
            <Link href="/admin" className="font-medium tracking-widest uppercase">
              {isOwner ? 'Admin' : 'Collaborator'}
              {pending > 0 && (
                <span className="ml-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">
                  {pending}
                </span>
              )}
            </Link>
            {isOwner && (
              <>
                <Link
                  href="/admin/audit"
                  className="text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  Audit
                </Link>
                <Link
                  href="/admin/forensic"
                  className="text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  Forensic
                </Link>
                <Link
                  href="/admin/testimonials"
                  className="text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  Testimonials
                </Link>
                <Link
                  href="/admin/maintenance"
                  className="text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  Maintenance
                </Link>
                <Link
                  href="/admin/settings"
                  className="text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  Settings
                </Link>
              </>
            )}
            <Link
              href="/"
              className="text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              View site
            </Link>
          </div>
          <div className="flex items-center gap-3">
            {isOwner && <UpdateBadge />}
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
