import { BASE_URL } from '@/lib/env';
import { getPublishedPortfolioGalleries } from '@/lib/public-data';

// Reads the live DB — must not be prerendered at build time (no env/DB there).
export const dynamic = 'force-dynamic';

export async function GET() {
  const galleries = getPublishedPortfolioGalleries();
  const urls = [
    `${BASE_URL}/`,
    `${BASE_URL}/about`,
    `${BASE_URL}/contact`,
    ...galleries.map((g) => `${BASE_URL}/portfolio/${g.slug}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
