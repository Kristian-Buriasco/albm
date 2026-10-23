import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, readJsonObject, requireOwner } from '@/lib/api';
import { logAdmin } from '@/lib/audit-log';
import { candidates, localPicks, MAX_SLIDES, pickWithClaude } from '@/lib/carousel';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Pick the best photos for an Instagram carousel. Cloud ranking only when the owner opts in and a key is set. */
export async function POST(req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  const gallery = getDb().select().from(schema.galleries).where(eq(schema.galleries.id, id)).get();
  if (!gallery) return errorJson('Not found', 404);
  const body = await readJsonObject(req).catch(() => ({}) as Record<string, unknown>);
  const count = Math.min(MAX_SLIDES, Math.max(2, Number(body.count) || MAX_SLIDES));
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  const cand = await candidates(id);
  if (cand.length < 2) return errorJson('Needs at least 2 ready photos', 400);

  let picks = localPicks(cand, count);
  let caption = '';
  let source: 'ai' | 'local' = 'local';
  let note: string | null = null;
  if (body.allowCloud === true) {
    if (!apiKey) note = 'ANTHROPIC_API_KEY is not set on the server; used local ranking.';
    else {
      try {
        ({ picks, caption } = await pickWithClaude(cand, id, gallery.title, count, apiKey));
        source = 'ai';
        logAdmin('carousel.ai', { targetType: 'gallery', targetId: id, summary: `Sent ${cand.length} previews of "${gallery.title}" to Anthropic for a carousel` });
      } catch (err) {
        console.error('[carousel] AI pick failed:', err);
        note = 'AI ranking failed; used local ranking.';
      }
    }
  }
  return json({ source, note, aiAvailable: Boolean(apiKey), caption, picks: picks.map((p) => ({ id: p.id, filename: p.filename })) });
}
