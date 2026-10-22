import { siteName } from './site-name';
import { BASE_URL } from '@/lib/env';
import { getSetting } from '@/lib/settings';
import { coverPhotoId, getPublishedPortfolioGalleries } from '@/lib/public-data';

export function portfolioFeedItems() {
  return getPublishedPortfolioGalleries().map((g) => {
    const cover = coverPhotoId(g);
    return {
      id: g.id,
      title: g.title,
      slug: g.slug,
      link: `${BASE_URL}/portfolio/${g.slug}`,
      publishedAt: g.updatedAt,
      coverUrl: cover ? `${BASE_URL}/img/${cover}/web` : null,
      description: g.title,
    };
  });
}

export function sitePersonName(): string {
  return siteName();
}
