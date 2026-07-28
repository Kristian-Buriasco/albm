import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pendingCommentCount } from '@/lib/comments';
import { unreadInquiryCount } from '@/lib/inquiries';
import { getPrincipal } from '@/lib/session';
import ThemeToggle from '@/components/ThemeToggle';
import UpdateBadge from '@/components/UpdateBadge';
import LogoutButton from './LogoutButton';
import AdminNav from './AdminNav';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const principal = await getPrincipal();
  if (!principal) redirect('/admin/login');
  const isOwner = principal.role === 'owner';

  const pending = isOwner ? pendingCommentCount() : 0;
  const newInquiries = isOwner ? unreadInquiryCount() : 0;

  return (
    <div className="min-h-screen">
      <header className="relative border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-6 text-sm">
            <Link href="/admin" className="shrink-0 font-medium tracking-widest uppercase">
              {isOwner ? 'Admin' : 'Collaborator'}
              {pending > 0 && (
                <span className="ml-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">
                  {pending}
                </span>
              )}
            </Link>
            <AdminNav isOwner={isOwner} newInquiries={newInquiries} />
          </div>
          <div className="flex shrink-0 items-center gap-3">
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
