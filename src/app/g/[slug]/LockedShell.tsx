'use client';

import ThemeToggle from '@/components/ThemeToggle';

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Kristian Buriasco';

/**
 * Premium shell for the client-gallery access gates (password / PIN).
 * Background uses only the cover's tiny blur `placeholder` (a ~24px data URI) —
 * never a real photo — so a locked visitor sees an ambient wash without any
 * actual gallery content leaking. Falls back to a neutral gradient when absent.
 */
export default function LockedShell({
  title,
  coverPlaceholder,
  children,
}: {
  title: string;
  coverPlaceholder?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {coverPlaceholder ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={coverPlaceholder}
          aria-hidden
          alt=""
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.45] saturate-125"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-100 to-neutral-300 dark:from-neutral-900 dark:to-neutral-950" />
      )}
      <div className="absolute inset-0 bg-black/25" aria-hidden />

      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-xs rounded-xl bg-white/85 p-8 text-center shadow-2xl ring-1 ring-black/5 backdrop-blur-md dark:bg-black/70 dark:ring-white/10">
        <p className="text-[10px] tracking-[0.3em] text-neutral-500 uppercase dark:text-neutral-400">
          {SITE_NAME}
        </p>
        <h1 className="mt-2 mb-6 text-sm font-light tracking-[0.25em] uppercase">
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}
