import { portfolioFeedItems, sitePersonName } from '@/lib/feed-data';
import { BASE_URL } from '@/lib/env';

// Reads the live DB — must not be prerendered at build time.
export const dynamic = 'force-dynamic';

export async function GET() {
  const items = portfolioFeedItems();
  const body = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${sitePersonName()} — Portfolio`,
    home_page_url: BASE_URL,
    feed_url: `${BASE_URL}/feed.json`,
    items: items.map((it) => ({
      id: it.id,
      title: it.title,
      url: it.link,
      date_published: new Date(it.publishedAt).toISOString(),
      image: it.coverUrl ?? undefined,
    })),
  };
  return Response.json(body);
}
