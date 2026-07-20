import { nanoid } from 'nanoid';
import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import type { Testimonial } from '@/db/schema';

export type TestimonialStatus = Testimonial['status'];

export type SubmitTestimonialInput = {
  galleryId: string;
  visitorId: string | null;
  rating: number;
  quote: string;
  authorName: string;
};

export type SubmitTestimonialResult =
  | { ok: true; testimonial: Testimonial }
  | { ok: false; error: string };

/**
 * Insert a new pending testimonial for a gallery. One submission per visitor
 * per gallery: if `visitorId` already has a testimonial there, this fails
 * rather than creating a duplicate.
 */
export function submitTestimonial(input: SubmitTestimonialInput): SubmitTestimonialResult {
  const rating = Math.round(input.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: 'Rating must be between 1 and 5' };
  }
  const quote = input.quote.trim();
  if (!quote) return { ok: false, error: 'Quote is required' };
  if (quote.length > 2000) return { ok: false, error: 'Quote too long' };
  const authorName = input.authorName.trim();
  if (!authorName) return { ok: false, error: 'Name is required' };
  if (authorName.length > 200) return { ok: false, error: 'Name too long' };

  const db = getDb();

  if (input.visitorId) {
    const existing = db
      .select({ id: schema.testimonials.id })
      .from(schema.testimonials)
      .where(
        and(
          eq(schema.testimonials.galleryId, input.galleryId),
          eq(schema.testimonials.visitorId, input.visitorId),
        ),
      )
      .get();
    if (existing) return { ok: false, error: 'You have already submitted a testimonial' };
  }

  const testimonial: Testimonial = {
    id: nanoid(),
    galleryId: input.galleryId,
    visitorId: input.visitorId,
    rating,
    quote,
    authorName,
    status: 'pending',
    createdAt: Date.now(),
    approvedAt: null,
  };
  db.insert(schema.testimonials).values(testimonial).run();
  return { ok: true, testimonial };
}

/** Whether this visitor already has a testimonial (any status) for the gallery. */
export function hasSubmittedTestimonial(galleryId: string, visitorId: string): boolean {
  const existing = getDb()
    .select({ id: schema.testimonials.id })
    .from(schema.testimonials)
    .where(
      and(
        eq(schema.testimonials.galleryId, galleryId),
        eq(schema.testimonials.visitorId, visitorId),
      ),
    )
    .get();
  return !!existing;
}

/** Admin listing, newest first, optionally filtered by status. */
export function listTestimonials(filter?: { status?: TestimonialStatus }): Testimonial[] {
  const db = getDb();
  const query = db.select().from(schema.testimonials).orderBy(desc(schema.testimonials.createdAt));
  if (filter?.status) {
    return query.where(eq(schema.testimonials.status, filter.status)).all();
  }
  return query.all();
}

export function approveTestimonial(id: string): Testimonial | null {
  const db = getDb();
  const existing = db.select().from(schema.testimonials).where(eq(schema.testimonials.id, id)).get();
  if (!existing) return null;
  db.update(schema.testimonials)
    .set({ status: 'approved', approvedAt: Date.now() })
    .where(eq(schema.testimonials.id, id))
    .run();
  return { ...existing, status: 'approved', approvedAt: Date.now() };
}

export function hideTestimonial(id: string): Testimonial | null {
  const db = getDb();
  const existing = db.select().from(schema.testimonials).where(eq(schema.testimonials.id, id)).get();
  if (!existing) return null;
  db.update(schema.testimonials).set({ status: 'hidden' }).where(eq(schema.testimonials.id, id)).run();
  return { ...existing, status: 'hidden' };
}

/** Approved testimonials for the public "What clients say" section, newest first. */
export function getApprovedTestimonials(limit = 20): Testimonial[] {
  return getDb()
    .select()
    .from(schema.testimonials)
    .where(eq(schema.testimonials.status, 'approved'))
    .orderBy(desc(schema.testimonials.approvedAt))
    .limit(limit)
    .all();
}
