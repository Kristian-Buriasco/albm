import { BASE_URL } from '@/lib/env';

// BASE_URL is runtime config; a static build would bake in localhost.
export const dynamic = 'force-dynamic';

export async function GET() {
  const body = `User-agent: *
Disallow: /admin
Disallow: /g/
Disallow: /api/

Sitemap: ${BASE_URL}/sitemap.xml
`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
