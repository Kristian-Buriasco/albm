import { portfolioFeedItems } from '@/lib/feed-data';

// Reads the live DB — must not be prerendered at build time.
export const dynamic = 'force-dynamic';

export async function GET() {
  const items = portfolioFeedItems();
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">',
    '<channel>',
    '<title>Albm — Portfolio</title>',
    '<description>Published portfolio galleries</description>',
    ...items.map(
      (it) =>
        `<item><title>${escapeXml(it.title)}</title><link>${it.link}</link><pubDate>${new Date(it.publishedAt).toUTCString()}</pubDate>${it.coverUrl ? `<enclosure url="${it.coverUrl}" type="image/jpeg"/>` : ''}</item>`,
    ),
    '</channel></rss>',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
