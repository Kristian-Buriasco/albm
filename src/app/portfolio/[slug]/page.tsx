import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import SiteHeader from '@/components/SiteHeader';
import PortfolioGrid from '@/components/PortfolioGrid';
import { getReadyPhotos } from '@/lib/public-data';

export const dynamic = 'force-dynamic';

export default async function PortfolioGalleryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const gallery = getDb()
    .select()
    .from(schema.galleries)
    .where(
      and(eq(schema.galleries.slug, slug), eq(schema.galleries.type, 'portfolio')),
    )
    .get();
  if (!gallery || !gallery.published) notFound();

  const photos = getReadyPhotos(gallery.id).map((p) => ({
    id: p.id,
    filename: p.filename,
    width: p.width,
    height: p.height,
  }));

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pb-24">
        <h1 className="py-10 text-center text-sm font-light tracking-[0.3em] uppercase">
          {gallery.title}
        </h1>
        {photos.length === 0 ? (
          <p className="py-24 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No photos yet.
          </p>
        ) : (
          <PortfolioGrid photos={photos} />
        )}
      </main>
    </div>
  );
}
