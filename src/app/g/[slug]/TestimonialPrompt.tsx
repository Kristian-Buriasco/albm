'use client';

import { useState } from 'react';

/**
 * Post-delivery "leave a testimonial" prompt for a client gallery.
 *
 * Owner wiring (in `g/[slug]/page.tsx`): render only when
 * `gallery.deliveryState === 'delivered' && hasVisitor && !alreadySubmitted`,
 * where `alreadySubmitted` comes from `hasSubmittedTestimonial(gallery.id, visitor.id)`
 * (`@/lib/testimonials`), computed alongside the existing visitor lookup.
 */
export default function TestimonialPrompt({ slug }: { slug: string }) {
  const [rating, setRating] = useState(5);
  const [quote, setQuote] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (status === 'done') {
    return (
      <section className="rounded-lg border border-neutral-200 p-6 text-sm dark:border-neutral-800">
        <p className="text-neutral-600 dark:text-neutral-400">
          Thank you — your testimonial was submitted and is awaiting review.
        </p>
      </section>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!quote.trim() || !authorName.trim()) {
      setError('Please fill in your name and a quote.');
      return;
    }
    setStatus('submitting');
    setError(null);
    try {
      const res = await fetch(`/api/g/${encodeURIComponent(slug)}/testimonial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, quote: quote.trim(), authorName: authorName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === 'string' ? data.error : 'Something went wrong');
        setStatus('error');
        return;
      }
      setStatus('done');
    } catch {
      setError('Something went wrong');
      setStatus('error');
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
      <h2 className="text-xs font-medium tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
        Leave a testimonial
      </h2>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              aria-pressed={rating >= n}
              onClick={() => setRating(n)}
              className={`text-2xl leading-none ${
                rating >= n ? 'text-amber-500' : 'text-neutral-300 dark:text-neutral-700'
              }`}
            >
              ★
            </button>
          ))}
        </div>
        <textarea
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="What was your experience like?"
          className="w-full rounded border border-neutral-300 bg-transparent p-2 text-sm outline-none dark:border-neutral-700"
        />
        <input
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          maxLength={200}
          placeholder="Your name"
          className="w-full rounded border border-neutral-300 bg-transparent p-2 text-sm outline-none dark:border-neutral-700"
        />
        {error && <p className="text-xs text-red-600 dark:text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="rounded bg-neutral-900 px-4 py-2 text-xs font-medium tracking-wide text-white uppercase disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {status === 'submitting' ? 'Submitting…' : 'Submit'}
        </button>
      </form>
    </section>
  );
}
