'use client';

import { useState } from 'react';

/**
 * Shown on a client gallery page when the owner has turned "featured" on
 * but the client hasn't answered yet (`gallery.featuredConsent === 'requested'`).
 * Owner wiring: render only when that condition holds, alongside the
 * existing TestimonialPrompt gating in `g/[slug]/page.tsx`.
 */
export default function FeaturedConsentPrompt({ slug }: { slug: string }) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [answer, setAnswer] = useState<boolean | null>(null);

  async function respond(granted: boolean) {
    setStatus('submitting');
    try {
      const res = await fetch(`/api/g/${encodeURIComponent(slug)}/featured-consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ granted }),
      });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      setAnswer(granted);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <section className="rounded-lg border border-neutral-200 p-6 text-sm dark:border-neutral-800">
        <p className="text-neutral-600 dark:text-neutral-400">
          {answer
            ? 'Thanks — this gallery may now appear in Featured Work on the homepage.'
            : 'Got it — this gallery will stay private and off the homepage.'}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
      <h2 className="text-xs font-medium tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
        Feature this gallery?
      </h2>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        We&apos;d love to show a few photos from this gallery in our public Featured Work
        section. Your other photos, your name, and any private details stay off the site
        either way — this is just the cover image and title.
      </p>
      {status === 'error' && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-500">Something went wrong.</p>
      )}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled={status === 'submitting'}
          onClick={() => respond(true)}
          className="rounded bg-neutral-900 px-4 py-2 text-xs font-medium tracking-wide text-white uppercase disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          Yes, feature it
        </button>
        <button
          type="button"
          disabled={status === 'submitting'}
          onClick={() => respond(false)}
          className="rounded border border-neutral-300 px-4 py-2 text-xs font-medium tracking-wide uppercase disabled:opacity-50 dark:border-neutral-700"
        >
          No thanks
        </button>
      </div>
    </section>
  );
}
