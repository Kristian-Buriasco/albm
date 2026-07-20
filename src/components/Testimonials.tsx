import type { Testimonial } from '@/db/schema';

/**
 * Public "What clients say" section. Renders nothing when there are no
 * approved testimonials. Owner wiring: fetch with
 * `getApprovedTestimonials()` (`@/lib/testimonials`) and pass the result in,
 * e.g. from the homepage or about page server component.
 */
export default function Testimonials({ testimonials }: { testimonials: Testimonial[] }) {
  if (testimonials.length === 0) return null;

  return (
    <section className="border-t border-neutral-200 pt-8 dark:border-neutral-800">
      <h2 className="mb-6 text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
        What clients say
      </h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {testimonials.map((t) => (
          <figure
            key={t.id}
            className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800"
          >
            <div aria-hidden className="text-amber-500">
              {'★'.repeat(t.rating)}
              <span className="text-neutral-300 dark:text-neutral-700">
                {'★'.repeat(5 - t.rating)}
              </span>
            </div>
            <blockquote className="mt-3 text-sm whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
              {t.quote}
            </blockquote>
            <figcaption className="mt-3 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {t.authorName}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
