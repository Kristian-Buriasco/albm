import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import { coverPhotoId, getPublishedPortfolioGalleries } from '@/lib/public-data';

export const dynamic = 'force-dynamic';

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Kristian Buriasco';

export default function HomePage() {
  const galleries = getPublishedPortfolioGalleries();
  const withCovers = galleries.map((g) => ({ gallery: g, cover: coverPhotoId(g) }));
  const hero = withCovers.find((g) => g.cover !== null);

  return (
    <div>
      <SiteHeader />

      {hero ? (
        <section className="relative mx-auto h-[70vh] w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/img/${hero.cover}/web`}
            alt={hero.gallery.title}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/40 to-transparent pb-10">
            <h1 className="text-lg font-light tracking-[0.3em] text-white uppercase">
              {SITE_NAME}
            </h1>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h1 className="text-lg font-light tracking-[0.3em] uppercase">{SITE_NAME}</h1>
          <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
            Portfolio coming soon.
          </p>
        </section>
      )}

      {withCovers.length > 0 && (
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-16 sm:grid-cols-2 lg:grid-cols-3">
          {withCovers.map(({ gallery, cover }) => (
            <Link
              key={gallery.id}
              href={`/portfolio/${gallery.slug}`}
              className="group block"
            >
              <div className="aspect-[4/3] overflow-hidden bg-neutral-100 dark:bg-neutral-900">
                {cover && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/img/${cover}/thumb`}
                    alt={gallery.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                )}
              </div>
              <p className="mt-3 text-xs tracking-widest text-neutral-500 uppercase group-hover:text-neutral-900 dark:text-neutral-400 dark:group-hover:text-neutral-100">
                {gallery.title}
              </p>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
