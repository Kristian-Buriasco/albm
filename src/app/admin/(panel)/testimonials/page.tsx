import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { isAdmin } from '@/lib/session';
import { listTestimonials } from '@/lib/testimonials';
import AdminTestimonialsClient from './AdminTestimonialsClient';

export const dynamic = 'force-dynamic';

export default async function AdminTestimonialsPage() {
  if (!(await isAdmin())) redirect('/admin/login');

  const rows = listTestimonials();
  const db = getDb();
  const galleryTitles = new Map<string, string>();
  for (const row of rows) {
    if (galleryTitles.has(row.galleryId)) continue;
    const gallery = db
      .select({ title: schema.galleries.title })
      .from(schema.galleries)
      .where(eq(schema.galleries.id, row.galleryId))
      .get();
    galleryTitles.set(row.galleryId, gallery?.title ?? 'Unknown gallery');
  }

  const testimonials = rows.map((row) => ({
    ...row,
    galleryTitle: galleryTitles.get(row.galleryId) ?? 'Unknown gallery',
  }));

  return <AdminTestimonialsClient testimonials={testimonials} />;
}
