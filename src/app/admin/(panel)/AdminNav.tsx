'use client';

import { useState } from 'react';
import Link from 'next/link';

const linkClass =
  'block py-2 text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 sm:inline sm:py-0';

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">
      {count}
    </span>
  );
}

export default function AdminNav({
  isOwner,
  newInquiries,
}: {
  isOwner: boolean;
  newInquiries: number;
}) {
  const [open, setOpen] = useState(false);

  const links = isOwner ? (
    <>
      <Link href="/admin/audit" className={linkClass} onClick={() => setOpen(false)}>
        Audit
      </Link>
      <Link href="/admin/forensic" className={linkClass} onClick={() => setOpen(false)}>
        Forensic
      </Link>
      <Link href="/admin/inquiries" className={linkClass} onClick={() => setOpen(false)}>
        Inquiries
        <Badge count={newInquiries} />
      </Link>
      <Link href="/admin/clients" className={linkClass} onClick={() => setOpen(false)}>
        Clients
      </Link>
      <Link href="/admin/testimonials" className={linkClass} onClick={() => setOpen(false)}>
        Testimonials
      </Link>
      <Link href="/admin/maintenance" className={linkClass} onClick={() => setOpen(false)}>
        Maintenance
      </Link>
      <Link href="/admin/settings" className={linkClass} onClick={() => setOpen(false)}>
        Settings
      </Link>
      <Link href="/docs/api" className={linkClass} onClick={() => setOpen(false)}>
        API docs
      </Link>
    </>
  ) : null;

  return (
    <div className="flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className="p-2 text-neutral-500 sm:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <div
        className={`${open ? 'flex' : 'hidden'} absolute top-full left-0 z-20 w-full flex-col gap-1 border-b border-neutral-200 bg-white px-6 py-3 shadow-lg dark:border-neutral-800 dark:bg-neutral-950 sm:static sm:z-auto sm:flex sm:w-auto sm:flex-row sm:items-center sm:gap-6 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none`}
      >
        {links}
        <Link href="/" className={linkClass} onClick={() => setOpen(false)}>
          View site
        </Link>
      </div>
    </div>
  );
}
