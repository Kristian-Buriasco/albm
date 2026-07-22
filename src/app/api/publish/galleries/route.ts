import { asc } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json } from '@/lib/api';
import { ipFromRequest, writeAllowed } from '@/lib/rate-limit';
import { verifyUploadToken } from '@/lib/upload-tokens';

export const dynamic = 'force-dynamic';

const RL_MAX = 120;
const RL_WINDOW = 15 * 60 * 1000;

/**
 * List galleries an upload token may publish to. Used by the Lightroom plugin's
 * gallery picker. Tokens are global (not gallery-scoped), so all galleries are
 * returned — same scope the upload endpoint already grants.
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!bearer) return errorJson('Unauthorized', 401);

  const tokenRow = verifyUploadToken(bearer);
  if (!tokenRow) return errorJson('Unauthorized', 401);

  const ip = ipFromRequest(req);
  if (!writeAllowed(`publish-list:${tokenRow.id}`, ip, RL_MAX, RL_WINDOW)) {
    return errorJson('Too many requests', 429);
  }

  const rows = getDb()
    .select({
      id: schema.galleries.id,
      title: schema.galleries.title,
      slug: schema.galleries.slug,
      type: schema.galleries.type,
    })
    .from(schema.galleries)
    .orderBy(asc(schema.galleries.title))
    .all();

  return json({ galleries: rows });
}
